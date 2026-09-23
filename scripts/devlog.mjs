/**
 * Devlog compiler: devlog/patch-<n>.md → { entries } for dist/devlog.json (newest first).
 *
 * Each file starts with a frontmatter block of `key: value` lines between `---` fences (format in
 * devlog/README.md). The parser is strict on purpose: an unknown key, a bad enum or a cost without its
 * measured/estimate label fails the build instead of publishing a wrong number.
 */
import fs from 'node:fs';
import path from 'node:path';

const FILE = /^patch-(\d+)\.md$/;
const ENUMS = {
    mode: ['agent', 'bootstrap', 'human'],
    chosenBy: ['agent', 'holders'],
    status: ['shipped', 'failed']
};
const KEYS = [
    'build',
    'date',
    'title',
    'mode',
    'chosenBy',
    'commit',
    'costUsd',
    'costMeasured',
    'status'
];
const SUMMARY_MAX = 280;

/** Parse one `key: value` value: quoted strings verbatim, otherwise strip a trailing ` # comment`. */
function scalar(raw) {
    const v = raw.trim();
    const q = /^(["'])(.*)\1$/.exec(v);
    if (q) return q[2];
    return v.replace(/\s+#(\s.*)?$/, '').trim();
}

/** Markdown paragraph → plain text (links, emphasis, code and list/quote markers stripped). */
function plain(md) {
    return md
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/^\s{0,3}(?:[-*+]|\d+\.|>)\s+/gm, '')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/(\*\*|~~|\*)(.+?)\1/g, '$2')
        .replace(/(^|\W)(__?)(.+?)\2(?=\W|$)/g, '$1$3')
        .replace(/\s+/g, ' ')
        .trim();
}

/** First prose paragraph (headings, fences and rules skipped), plain text, at most 280 chars. */
export function summarize(body) {
    const para = body
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .find((p) => p && !/^(#{1,6}\s|```|~~~|(-{3,}|\*{3,})$)/.test(p));
    const text = para ? plain(para) : '';
    if (text.length <= SUMMARY_MAX) return text;
    const cut = text.slice(0, SUMMARY_MAX - 1);
    const space = cut.lastIndexOf(' ');
    return `${space > 200 ? cut.slice(0, space) : cut}…`;
}

/** Parse one devlog file's text. Throws with the file name on any format error. */
export function parseDevlog(text, file = 'devlog') {
    const fail = (msg) => {
        throw new Error(`${file}: ${msg}`);
    };
    const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(text);
    if (!m) fail('missing frontmatter block (--- ... ---)');

    const fm = {};
    for (const line of m[1].split(/\r?\n/)) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const kv = /^([A-Za-z]+):(.*)$/.exec(line);
        if (!kv) fail(`bad frontmatter line: ${line}`);
        if (!KEYS.includes(kv[1])) fail(`unknown key "${kv[1]}"`);
        if (kv[1] in fm) fail(`duplicate key "${kv[1]}"`);
        fm[kv[1]] = scalar(kv[2]);
    }

    if (!/^\d+$/.test(fm.build ?? '')) fail('build must be a non-negative integer');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.date ?? '') || !Number.isFinite(Date.parse(fm.date)))
        fail('date must be YYYY-MM-DD');
    if (!fm.title) fail('title is required');
    for (const [key, allowed] of Object.entries(ENUMS)) {
        const v = fm[key] || (key === 'chosenBy' ? 'agent' : '');
        if (!allowed.includes(v)) fail(`${key} must be one of ${allowed.join(' | ')}`);
        fm[key] = v;
    }

    let costUsd = null;
    if (fm.costUsd) {
        costUsd = Number(fm.costUsd);
        if (!Number.isFinite(costUsd) || costUsd < 0) fail('costUsd must be a non-negative number');
    }
    let costMeasured = null;
    if (fm.costMeasured) {
        if (fm.costMeasured !== 'true' && fm.costMeasured !== 'false')
            fail('costMeasured must be true or false');
        costMeasured = fm.costMeasured === 'true';
    }
    if (costUsd !== null && costMeasured === null)
        fail('costMeasured is required when costUsd is set (measured or estimate?)');

    const body = m[2].trim();
    return {
        build: Number(fm.build),
        date: fm.date,
        title: fm.title,
        mode: fm.mode,
        chosenBy: fm.chosenBy,
        commit: fm.commit || null,
        costUsd,
        costMeasured,
        status: fm.status,
        summary: summarize(body),
        body
    };
}

/** Compile every devlog/patch-<n>.md under `rootDir`. A missing devlog/ directory is an empty devlog. */
export function compileDevlog(rootDir) {
    const dir = path.join(rootDir, 'devlog');
    if (!fs.existsSync(dir)) return { entries: [] };
    const seen = new Set();
    const entries = fs
        .readdirSync(dir)
        .filter((f) => FILE.test(f))
        .map((f) => {
            const e = parseDevlog(fs.readFileSync(path.join(dir, f), 'utf8'), `devlog/${f}`);
            if (e.build !== Number(FILE.exec(f)[1]))
                throw new Error(`devlog/${f}: build ${e.build} does not match the file name`);
            if (seen.has(e.build)) throw new Error(`devlog/${f}: duplicate build ${e.build}`);
            seen.add(e.build);
            return e;
        });
    entries.sort((a, b) => b.date.localeCompare(a.date) || b.build - a.build);
    return { entries };
}
