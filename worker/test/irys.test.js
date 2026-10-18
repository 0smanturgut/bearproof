import test from 'node:test';
import assert from 'node:assert/strict';
import {
    IRYS_GATEWAY,
    IRYS_NODE,
    contentType,
    createDataItem,
    deepHash,
    parseDataItem,
    serializeTags
} from '../src/lib/irys.js';
import { archiveTick, archiveView, buildManifest, devlogText, loadState } from '../src/archive.js';
import { base58Encode } from '../src/lib/vote.js';
import { fakeD1, fakeKV } from './helpers/d1.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** A throwaway key for the test only: a WebCrypto Ed25519 pair as signer + base58 64-byte secret. */
async function testKey() {
    const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    const seed = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey)).slice(-32);
    const secret = new Uint8Array(64);
    secret.set(seed);
    secret.set(pub, 32);
    return {
        kp,
        pub,
        secretB58: base58Encode(secret),
        signer: {
            publicKey: pub,
            sign: async (m) => new Uint8Array(await crypto.subtle.sign('Ed25519', kp.privateKey, m))
        }
    };
}

test('tags are Avro: count, length-prefixed name and value, then a zero block', () => {
    assert.deepEqual([...serializeTags([{ name: 'a', value: 'bc' }])], [2, 2, 97, 4, 98, 99, 0]);
    assert.equal(serializeTags([]).byteLength, 0);
    // A 70-byte value needs a two-byte varint length (140 = 0x8c 0x01).
    const long = serializeTags([{ name: 'k', value: 'x'.repeat(70) }]);
    assert.deepEqual([...long.subarray(0, 5)], [2, 2, 107, 0x8c, 0x01]);
    assert.throws(() => serializeTags([{ name: 'k', value: 'x'.repeat(5000) }]), /4096/);
    assert.throws(() => serializeTags([{ name: '', value: 'x' }]), /non-empty/);
});

test('deep hash: a blob and a list hash differently, and the same input always hashes the same', async () => {
    const a = await deepHash(enc.encode('x'));
    const b = await deepHash([enc.encode('x')]);
    assert.equal(a.byteLength, 48);
    assert.notDeepEqual([...a], [...b]);
    assert.deepEqual([...(await deepHash([enc.encode('x')]))], [...b]);
});

test('a data item reads back, its signature verifies, and its id is sha256(signature) in base58', async () => {
    const k = await testKey();
    const tags = [
        { name: 'Content-Type', value: 'text/plain' },
        { name: 'App-Name', value: 'BEARPROOF' }
    ];
    const item = await createDataItem('every build, kept', tags, k.signer);
    const p = await parseDataItem(item.bytes);
    assert.equal(p.type, 2);
    assert.deepEqual([...p.owner], [...k.pub]);
    assert.equal(p.tagCount, 2);
    assert.equal(dec.decode(p.data), 'every build, kept');
    assert.ok(await crypto.subtle.verify('Ed25519', k.kp.publicKey, p.signature, p.message));
    const sigHash = new Uint8Array(await crypto.subtle.digest('SHA-256', p.signature));
    assert.equal(item.id, base58Encode(sigHash));
    // Deterministic: the same content and tags give the same id (a repeated upload is the same item).
    assert.equal((await createDataItem('every build, kept', tags, k.signer)).id, item.id);
    assert.notEqual((await createDataItem('every build, kept!', tags, k.signer)).id, item.id);
});

test('content types cover what a build ships', () => {
    assert.equal(contentType('index.html'), 'text/html; charset=utf-8');
    assert.equal(contentType('src/main.js'), 'text/javascript; charset=utf-8');
    assert.equal(contentType('assets/fonts/jersey-10.woff2'), 'font/woff2');
    assert.equal(contentType('assets/bull.svg'), 'image/svg+xml');
    assert.equal(contentType('manifest.json'), 'application/json');
    assert.equal(contentType('weird.bin'), 'application/octet-stream');
});

test('the manifest points every path at its item and opens the game at index.html', () => {
    const m = buildManifest({ 'index.html': { id: 'A' }, 'src/main.js': { id: 'B' } });
    assert.equal(m.manifest, 'irys/paths');
    assert.deepEqual(m.index, { path: 'index.html' });
    assert.equal(m.paths['src/main.js'].id, 'B');
    assert.equal(buildManifest({ 'a.txt': { id: 'C' } }).index, undefined);
});

test('the devlog text carries the build, the numbers and the commit', () => {
    const t = devlogText(
        {
            build: 5,
            date: '2026-09-28',
            title: 'Diamond Hands',
            mode: 'agent',
            chosenBy: 'holders',
            costUsd: 1.234,
            costMeasured: true,
            status: 'shipped',
            body: 'Shipped: Diamond Hands.'
        },
        { n: 5, title: 'Diamond Hands', commit: 'abc123' },
        'https://github.com/0smanturgut/bearproof'
    );
    assert.match(t, /^# Build #5: Diamond Hands/);
    assert.match(t, /Cost: \$1\.23 \(measured\)/);
    assert.match(t, /commit\/abc123/);
    assert.match(t, /Shipped: Diamond Hands\./);
});

// ---- the cron step, against fake bindings and a fake bundler ----

const NOW = Date.parse('2026-10-18T12:00:00Z');

function fileOf(p, text) {
    return { p, text, bytes: enc.encode(text) };
}

async function hex(bytes) {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

async function archiveJson(builds) {
    return {
        builds: await Promise.all(
            builds.map(async (b) => ({
                n: b.n,
                title: b.title,
                mode: 'agent',
                commit: `c${b.n}`,
                activatesAt: b.activatesAt,
                files: await Promise.all(
                    b.files.map(async (f) => ({
                        p: f.p,
                        sha256: await hex(f.bytes),
                        bytes: f.bytes.length
                    }))
                )
            }))
        )
    };
}

async function setup({ builds, devlog = [], status402 = false } = {}) {
    const k = await testKey();
    const DB = fakeD1();
    const exec = (sql, ...args) => DB.db.prepare(sql).run(...args);
    const assets = new Map();
    const setBuilds = async (list) => {
        assets.set('/archive.json', enc.encode(JSON.stringify(await archiveJson(list))));
        for (const b of list) for (const f of b.files) assets.set(`/b/${b.n}/${f.p}`, f.bytes);
    };
    await setBuilds(builds);
    assets.set('/devlog.json', enc.encode(JSON.stringify({ entries: devlog })));
    const env = {
        DB,
        CONFIG: fakeKV(),
        IRYS_WALLET_KEY: k.secretB58,
        SITE_URL: 'https://bearproof.app',
        REPO_URL: 'https://github.com/0smanturgut/bearproof',
        ASSETS: {
            fetch: async (req) => {
                const b = assets.get(new URL(req.url).pathname);
                return b ? new Response(b) : new Response('nope', { status: 404 });
            }
        }
    };
    const uploaded = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        assert.equal(String(url), `${IRYS_NODE}/tx/solana`);
        if (status402) return new Response('Not enough balance for transaction', { status: 402 });
        const bytes = new Uint8Array(init.body);
        const p = await parseDataItem(bytes);
        assert.ok(await crypto.subtle.verify('Ed25519', k.kp.publicKey, p.signature, p.message));
        const sigHash = new Uint8Array(await crypto.subtle.digest('SHA-256', p.signature));
        const id = base58Encode(sigHash);
        uploaded.push({ id, data: dec.decode(p.data), rawTags: p.rawTags });
        return Response.json({ id });
    };
    return { env, exec, uploaded, setBuilds, restore: () => (globalThis.fetch = realFetch), k };
}

const B1 = {
    n: 1,
    title: 'The bull-vs-bear rebuild',
    activatesAt: '2026-09-23T16:58:37Z',
    files: [
        fileOf('index.html', '<h1>bull</h1>'),
        fileOf('src/main.js', 'boot()'),
        fileOf('assets/a.svg', '<svg/>')
    ]
};
const B2 = {
    n: 2,
    title: 'The new look',
    activatesAt: '2026-09-24T00:00:00Z',
    files: [
        fileOf('index.html', '<h1>bull</h1>'),
        fileOf('src/main.js', 'boot(2)'),
        fileOf('assets/a.svg', '<svg/>')
    ]
};
const QUEUED = { ...B2, n: 3, title: 'Tonight', activatesAt: '2026-10-19T00:00:00Z' };

test('the archive stores each live build once, shares unchanged files, and serves it from a manifest', async () => {
    const t = await setup({
        builds: [B1, B2, QUEUED],
        devlog: [
            {
                build: 2,
                title: 'The new look',
                body: 'Shipped: the new look.',
                costUsd: 2,
                costMeasured: true
            }
        ]
    });
    try {
        const r = await archiveTick(t.env, { now: NOW });
        assert.equal(r.status, 'live');
        assert.equal(r.caughtUp, true);
        // B1: 3 files + manifest; B2: 1 changed file + devlog + manifest; the queued build waits.
        assert.equal(r.uploads, 7);
        const s = await loadState(t.env);
        assert.deepEqual(Object.keys(s.builds).sort(), ['1', '2']);
        const m2 = JSON.parse(t.uploaded.find((u) => u.id === s.builds[2][0].id).data);
        const m1 = JSON.parse(t.uploaded.find((u) => u.id === s.builds[1][0].id).data);
        assert.equal(m2.index.path, 'index.html');
        assert.equal(m2.paths['index.html'].id, m1.paths['index.html'].id); // shared, stored once
        assert.notEqual(m2.paths['src/main.js'].id, m1.paths['src/main.js'].id);
        assert.match(
            t.uploaded.find((u) => u.id === m2.paths['devlog.md'].id).data,
            /^# Build #2: The new look/
        );
        assert.equal(m1.paths['devlog.md'], undefined);
        // Every item names the project.
        assert.ok(t.uploaded.every((u) => dec.decode(u.rawTags).includes('BEARPROOF')));

        // Caught up: the next run uploads nothing.
        const again = await archiveTick(t.env, { now: NOW });
        assert.equal(again.uploads, 0);

        // Build #2 updated in place: a second revision, the first one stays, the devlog is reused.
        await t.setBuilds([
            B1,
            { ...B2, files: [...B2.files.slice(0, 2), fileOf('assets/a.svg', '<svg id=2/>')] }
        ]);
        const rev = await archiveTick(t.env, { now: NOW });
        assert.equal(rev.uploads, 2); // the changed file + the new manifest
        const s2 = await loadState(t.env);
        assert.equal(s2.builds[2].length, 2);
        assert.equal(s2.builds[2][1].devlog, s2.builds[2][0].devlog);

        const view = await (await archiveView(t.env)).json();
        assert.equal(view.status, 'live');
        assert.equal(view.totals.builds, 2);
        assert.equal(view.totals.revisions, 3);
        assert.equal(view.builds[0].n, 2);
        assert.equal(view.builds[0].revisions[1].play, `${IRYS_GATEWAY}/${s2.builds[2][1].id}/`);
        assert.equal(view.wallet, (await loadState(t.env)).wallet);
    } finally {
        t.restore();
    }
});

test('a settled Daily is stored from the public board, with replay hashes and never the replay itself', async () => {
    const t = await setup({ builds: [] });
    try {
        t.exec(
            'INSERT INTO daily_challenges (date, build, seed, stage, created_at) VALUES (?, 5, 77, ?, 0)',
            '2026-10-16',
            'chart'
        );
        t.exec(
            'INSERT INTO daily_challenges (date, build, seed, stage, created_at) VALUES (?, 5, 78, ?, 0)',
            '2026-10-17',
            'chart'
        );
        t.exec(
            'INSERT INTO daily_challenges (date, build, seed, stage, created_at) VALUES (?, 5, 79, ?, 0)',
            '2026-10-18',
            'chart'
        );
        const log = Uint8Array.from([1, 2, 3, 4, 5]);
        t.exec(
            `INSERT INTO runs (id, player_id, mode, challenge_date, build, seed, claimed_score, claimed_time_ms,
               claimed_kills, claimed_level, duration_ms, input_log, input_log_bytes, status, bot_check, created_at)
             VALUES ('run1', 'p1', 'daily', '2026-10-16', 5, 77, 9000, 1000, 10, 3, 1000, ?, 5, 'verified', 'passed', 1)`,
            log
        );
        t.exec(
            `INSERT INTO daily_winners (date, run_id, player_id, score, payout_status, payout_token, payout_amount, payout_tx, note, created_at)
             VALUES ('2026-10-16', 'run1', 'p1', 9000, 'paid', 'ANSEM', '123', 'SigPaid', '{}', 1)`
        );
        // 17 Oct's payout is still moving: it waits. 18 Oct is today: it waits.
        t.exec(
            `INSERT INTO daily_winners (date, run_id, player_id, score, payout_status, note, created_at)
             VALUES ('2026-10-17', 'run1', 'p1', 9000, 'pending', '{}', 1)`
        );
        const r = await archiveTick(t.env, { now: NOW });
        assert.equal(r.uploads, 1);
        const s = await loadState(t.env);
        assert.deepEqual(Object.keys(s.days), ['2026-10-16']);
        const rec = JSON.parse(t.uploaded[0].data);
        assert.equal(rec.kind, 'daily-result');
        assert.equal(rec.seed, 77);
        assert.equal(rec.leaderboard.rows[0].runId, 'run1');
        assert.equal(rec.payouts[0].tx, 'SigPaid');
        assert.equal(rec.replays[0].sha256, await hex(log));
        assert.ok(!t.uploaded[0].data.includes('input_log'));
        assert.ok(!t.uploaded[0].data.includes('"p1"')); // no player id, only the board name
    } finally {
        t.restore();
    }
});

test('a 402 stops the run and says the archive needs funding; the kill switch and a missing key turn it off', async () => {
    const t = await setup({ builds: [B1], status402: true });
    try {
        const r = await archiveTick(t.env, { now: NOW });
        assert.equal(r.status, 'needs_funding');
        assert.equal((await (await archiveView(t.env)).json()).status, 'needs_funding');
        await t.env.CONFIG.put('irys:enabled', 'false');
        assert.equal((await archiveTick(t.env, { now: NOW })).status, 'paused');
        assert.equal((await archiveTick({ ...t.env, IRYS_WALLET_KEY: undefined })).status, 'off');
    } finally {
        t.restore();
    }
});

test('the upload budget stops a run part-way and the next run carries on without uploading twice', async () => {
    const t = await setup({ builds: [B1, B2] });
    try {
        const first = await archiveTick(t.env, { now: NOW, maxUploads: 2 });
        assert.equal(first.uploads, 2);
        assert.equal(first.caughtUp, false);
        const rest = await archiveTick(t.env, { now: NOW });
        assert.equal(rest.caughtUp, true);
        assert.equal(new Set(t.uploaded.map((u) => u.id)).size, t.uploaded.length);
        assert.equal(t.uploaded.length, 6); // 3 + manifest, then 1 changed file + manifest
    } finally {
        t.restore();
    }
});
