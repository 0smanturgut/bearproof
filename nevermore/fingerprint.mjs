#!/usr/bin/env node
/**
 * The fingerprint gate: tests are read-only, and every one of them is fingerprinted.
 *
 *   node nevermore/fingerprint.mjs [--dir nevermore/tests] [--file nevermore/FINGERPRINTS]
 *   node nevermore/fingerprint.mjs --write …      (only for whoever merges new tests: never the build agent)
 *
 * Refuses (exit 1) when a test file changed, was deleted, was added without a fingerprint, or carries a
 * skip / only / fixme / todo marker. FINGERPRINTS has one line per file, sorted by name: "<sha256>  <file>".
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/** Keys that mark a test as disabled, and text that does the same inside any string value. */
const MARKER_KEYS =
    /^(skip|skipped|only|fixme|todo|xfail|pending|disabled|disable|ignore|quarantine)$/i;
const MARKER_TEXT =
    /\b(fixme|todo|xfail)\b|\.(skip|only|fixme|todo)\s*\(|@(skip|only|fixme|todo)\b|\b(skip|only)\s*:\s*true\b/i;

/** Every marker found in a test file's text. */
export function findMarkers(text) {
    const found = [];
    let obj = null;
    try {
        obj = JSON.parse(text);
    } catch {
        /* not JSON: text scan only */
    }
    const walk = (v, where) => {
        if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
        else if (v && typeof v === 'object')
            for (const [k, x] of Object.entries(v)) {
                if (MARKER_KEYS.test(k)) found.push(`${where}.${k}: marker key`);
                walk(x, `${where}.${k}`);
            }
        else if (typeof v === 'string' && MARKER_TEXT.test(v)) found.push(`${where}: marker text`);
    };
    if (obj) walk(obj, '$');
    else if (MARKER_TEXT.test(text)) found.push('marker text');
    return found;
}

/** Fingerprint lines for every file in `dir` (recursively), sorted by relative path. */
export function computeLines(dir) {
    const out = [];
    const walk = (d) => {
        if (!fs.existsSync(d)) return;
        for (const f of fs.readdirSync(d).sort()) {
            const p = path.join(d, f);
            if (fs.statSync(p).isDirectory()) walk(p);
            else if (!f.startsWith('.'))
                out.push({
                    name: path.relative(dir, p).split(path.sep).join('/'),
                    sha: sha256(fs.readFileSync(p))
                });
        }
    };
    walk(dir);
    return out
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        .map((x) => `${x.sha}  ${x.name}`);
}

export function parseFingerprints(text) {
    const map = new Map();
    const bad = [];
    for (const line of text.split('\n')) {
        if (!line.trim() || line.startsWith('#')) continue;
        const m = /^([0-9a-f]{64}) {2}(\S.*)$/.exec(line);
        if (m) map.set(m[2], m[1]);
        else bad.push(line.slice(0, 80));
    }
    return { map, bad };
}

/**
 * Compare a directory with its FINGERPRINTS file. Returns `{ ok, problems, checked, setFingerprint }`.
 */
export function checkFingerprints(dir, file) {
    const problems = [];
    if (!fs.existsSync(file))
        return { ok: false, problems: [`${file}: missing`], checked: 0, setFingerprint: null };
    const text = fs.readFileSync(file, 'utf8');
    const { map, bad } = parseFingerprints(text);
    for (const b of bad) problems.push(`FINGERPRINTS: unreadable line '${b}'`);
    const lines = computeLines(dir);
    const actual = new Map(lines.map((l) => [l.slice(66), l.slice(0, 64)]));
    for (const [name, sha] of map) {
        if (!actual.has(name)) problems.push(`${name}: deleted`);
        else if (actual.get(name) !== sha) problems.push(`${name}: changed`);
    }
    for (const name of actual.keys())
        if (!map.has(name)) problems.push(`${name}: not fingerprinted (added)`);
    for (const name of actual.keys()) {
        for (const m of findMarkers(fs.readFileSync(path.join(dir, name), 'utf8')))
            problems.push(`${name}: ${m}`);
    }
    const setFingerprint = sha256(lines.map((l) => l + '\n').join(''));
    return { ok: problems.length === 0, problems, checked: actual.size, setFingerprint };
}

export function writeFingerprints(dir, file) {
    const lines = computeLines(dir);
    fs.writeFileSync(file, lines.map((l) => l + '\n').join(''));
    return lines;
}

function main(argv) {
    const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
    const dir = opt('--dir', 'nevermore/tests');
    const file = opt('--file', 'nevermore/FINGERPRINTS');
    if (argv.includes('--write')) {
        const lines = writeFingerprints(dir, file);
        console.log(`fingerprint: wrote ${lines.length} line(s) to ${file}`);
        return 0;
    }
    const r = checkFingerprints(dir, file);
    if (!r.ok) {
        console.error(
            `FINGERPRINT GATE FAILED (${r.problems.length}):\n  ${r.problems.join('\n  ')}`
        );
        return 1;
    }
    console.log(`fingerprint: ${r.checked} test file(s) unchanged; set ${r.setFingerprint}`);
    return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    process.exit(main(process.argv.slice(2)));
