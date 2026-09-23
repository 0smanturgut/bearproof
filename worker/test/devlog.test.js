import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compileDevlog, parseDevlog, summarize } from '../../scripts/devlog.mjs';

const doc = (fm, bodyText = 'Shipped the thing.') => `---\n${fm}\n---\n${bodyText}\n`;

const FULL = `build: 1
date: 2026-09-24
title: The bull-vs-bear rebuild
mode: bootstrap            # agent | bootstrap | human
chosenBy: holders          # agent | holders
commit: 3f2c1ab
costUsd: 0.42              # number or empty
costMeasured: true         # true = measured, false = estimate
status: shipped            # shipped | failed`;

test('parseDevlog reads every field and strips comments', () => {
    const e = parseDevlog(
        doc(FULL, '## Shipped\n\nGreen **candles** now [explode](https://x.y).\n\nMore.')
    );
    assert.deepEqual(
        { ...e, body: undefined },
        {
            build: 1,
            date: '2026-09-24',
            title: 'The bull-vs-bear rebuild',
            mode: 'bootstrap',
            chosenBy: 'holders',
            commit: '3f2c1ab',
            costUsd: 0.42,
            costMeasured: true,
            status: 'shipped',
            summary: 'Green candles now explode.',
            body: undefined
        }
    );
    assert.ok(e.body.startsWith('## Shipped'));
});

test('parseDevlog defaults: empty commit/cost are null, chosenBy defaults to agent', () => {
    const e = parseDevlog(
        doc(
            'build: 2\ndate: 2026-09-25\ntitle: Patch #2 is live\nmode: agent\ncommit:\ncostUsd:\nstatus: failed'
        )
    );
    assert.equal(e.title, 'Patch #2 is live', 'a # inside a word is not a comment');
    assert.equal(e.commit, null);
    assert.equal(e.costUsd, null);
    assert.equal(e.costMeasured, null);
    assert.equal(e.chosenBy, 'agent');
    assert.equal(e.status, 'failed');
});

test('parseDevlog keeps quoted values verbatim and handles CRLF', () => {
    const text = doc(
        'build: 3\ndate: 2026-09-26\ntitle: "Rug Lord # boss"\nmode: human\nstatus: shipped'
    );
    const e = parseDevlog(text.replace(/\n/g, '\r\n'));
    assert.equal(e.title, 'Rug Lord # boss');
    assert.equal(e.mode, 'human');
});

const BAD = [
    ['no frontmatter', 'just text', /missing frontmatter/],
    ['unknown key', doc(`${FULL}\nprice: 1`), /unknown key "price"/],
    ['duplicate key', doc(`${FULL}\nbuild: 2`), /duplicate key "build"/],
    ['bad build', doc(FULL.replace('build: 1', 'build: one')), /build must be/],
    ['bad date', doc(FULL.replace('2026-09-24', '24/09/2026')), /date must be/],
    ['missing title', doc(FULL.replace(/title: .*/, 'title:')), /title is required/],
    ['bad mode', doc(FULL.replace('mode: bootstrap', 'mode: robot')), /mode must be/],
    [
        'bad chosenBy',
        doc(FULL.replace('chosenBy: holders', 'chosenBy: whales')),
        /chosenBy must be/
    ],
    ['bad status', doc(FULL.replace('status: shipped', 'status: maybe')), /status must be/],
    ['negative cost', doc(FULL.replace('costUsd: 0.42', 'costUsd: -1')), /costUsd must be/],
    [
        'bad measured flag',
        doc(FULL.replace('costMeasured: true', 'costMeasured: yes')),
        /true or false/
    ],
    [
        'cost without measured/estimate label',
        doc(FULL.replace(/costMeasured: .*/, '')),
        /costMeasured is required/
    ]
];

for (const [name, text, re] of BAD) {
    test(`parseDevlog rejects: ${name}`, () => {
        assert.throws(
            () => parseDevlog(text, 'devlog/patch-1.md'),
            (err) => {
                assert.match(err.message, /^devlog\/patch-1\.md: /);
                assert.match(err.message, re);
                return true;
            }
        );
    });
}

test('summarize: first prose paragraph, plain text, at most 280 chars', () => {
    assert.equal(
        summarize('# Title\n\n---\n\n- `Diamond Hands` now _evolves_.\n\nNext.'),
        'Diamond Hands now evolves.'
    );
    assert.equal(summarize('Kept snake_case_names intact.'), 'Kept snake_case_names intact.');
    assert.equal(summarize(''), '');
    const long = summarize(`${'word '.repeat(100)}\n\nsecond`);
    assert.ok(long.length <= 280 && long.endsWith('…'));
    assert.ok(!long.includes('second'));
});

test('compileDevlog sorts newest first, ignores other files, validates file names', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devlog-test-'));
    try {
        assert.deepEqual(compileDevlog(root), { entries: [] }, 'no devlog/ dir is an empty devlog');
        const dir = path.join(root, 'devlog');
        fs.mkdirSync(dir);
        const entry = (n, date) =>
            doc(`build: ${n}\ndate: ${date}\ntitle: Patch ${n}\nmode: agent\nstatus: shipped`);
        fs.writeFileSync(path.join(dir, 'README.md'), '# not an entry');
        fs.writeFileSync(path.join(dir, 'patch-1.md'), entry(1, '2026-09-24'));
        fs.writeFileSync(path.join(dir, 'patch-3.md'), entry(3, '2026-09-26'));
        fs.writeFileSync(path.join(dir, 'patch-2.md'), entry(2, '2026-09-25'));
        assert.deepEqual(
            compileDevlog(root).entries.map((e) => e.build),
            [3, 2, 1]
        );

        fs.writeFileSync(path.join(dir, 'patch-4.md'), entry(5, '2026-09-27'));
        assert.throws(() => compileDevlog(root), /does not match the file name/);
        fs.rmSync(path.join(dir, 'patch-4.md'));

        fs.writeFileSync(path.join(dir, 'patch-01.md'), entry(1, '2026-09-24'));
        assert.throws(() => compileDevlog(root), /duplicate build 1/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
