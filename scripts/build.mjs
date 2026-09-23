#!/usr/bin/env node
/**
 * Assemble ./dist for `wrangler deploy`.
 *
 *   dist/                 HQ (copied from hq/)
 *   dist/b/<n>/           every build in builds/builds.json, extracted from its git ref (never from the working tree)
 *   dist/b/<n>/build-info.json
 *   dist/builds.json      public manifest
 *   dist/devlog.json      devlog/patch-<n>.md compiled by scripts/devlog.mjs (the HQ fetches it directly)
 *   dist/_headers         cache + security headers
 *
 * Flags:
 *   --next   also copy the working-tree game/ to dist/b/next/ for local preview (never activated)
 *
 * Every build's ref must resolve to the commit recorded in the manifest. A moved tag fails the build.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileDevlog } from './devlog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const args = new Set(process.argv.slice(2));

// Top-level entries of game/ that are dev-only and never shipped.
const GAME_EXCLUDE = [
    'test',
    'scripts',
    'server.js',
    'BALANCE.md',
    'README.md',
    'art-preview.html'
];

function git(...a) {
    return execFileSync('git', a, { cwd: ROOT, maxBuffer: 512 * 1024 * 1024 });
}

function extract(ref, srcPath, files, outDir) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bullrun-build-'));
    try {
        const specs = files
            ? files.map((f) => (srcPath === '.' ? f : `${srcPath}/${f}`))
            : [srcPath];
        const tar = git('archive', '--format=tar', ref, '--', ...specs);
        execFileSync('tar', ['-x', '-C', tmp], { input: tar });
        fs.cpSync(srcPath === '.' ? tmp : path.join(tmp, srcPath), outDir, { recursive: true });
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

function pruneGame(dir) {
    for (const name of GAME_EXCLUDE)
        fs.rmSync(path.join(dir, name), { recursive: true, force: true });
}

/**
 * Builds = static entries in builds/builds.json (Build #0) + one annotated tag `build-<n>` per shipped build.
 * The tag message's last line is JSON metadata: {"n","title","mode","activatesAt","costUsd"}. The release
 * workflow creates those tags; the Build Agent can't. `revoked` in builds.json pulls a build from rotation.
 */
function collectBuilds() {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'builds/builds.json'), 'utf8'));
    const out = manifest.builds.map((b) => ({ ...b }));
    const tags = git('tag', '-l', 'build-*').toString().split('\n').filter(Boolean);
    for (const tag of tags) {
        const msg = git('tag', '-l', '--format=%(contents)', tag).toString().trim().split('\n');
        let meta;
        try {
            meta = JSON.parse(msg[msg.length - 1]);
        } catch {
            throw new Error(`tag ${tag}: last line of the tag message must be JSON metadata`);
        }
        const n = Number(tag.slice('build-'.length));
        if (meta.n !== n) throw new Error(`tag ${tag}: metadata says n=${meta.n}`);
        if (out.some((b) => b.n === n)) throw new Error(`build ${n} defined twice`);
        const commit = git('rev-parse', `${tag}^{commit}`).toString().trim();
        out.push({ path: 'game', costUsd: null, ...meta, n, ref: tag, commit });
    }
    for (const n of manifest.revoked || []) {
        const b = out.find((x) => x.n === n);
        if (b) b.revoked = true;
    }
    return out.sort((a, b) => a.n - b.n);
}

const builds = collectBuilds();

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'b'), { recursive: true });

for (const b of builds) {
    const resolved = git('rev-parse', `${b.ref}^{commit}`).toString().trim();
    if (resolved !== b.commit) {
        throw new Error(`build ${b.n}: ref ${b.ref} is ${resolved}, manifest says ${b.commit}`);
    }
    const out = path.join(DIST, 'b', String(b.n));
    extract(b.ref, b.path || 'game', b.files || null, out);
    if ((b.path || 'game') === 'game') pruneGame(out);
    fs.writeFileSync(
        path.join(out, 'build-info.json'),
        JSON.stringify(
            { n: b.n, commit: b.commit, ref: b.ref, activatesAt: b.activatesAt, title: b.title },
            null,
            2
        )
    );
    console.log(`build ${b.n} <- ${b.ref} (${b.commit.slice(0, 7)})`);
}

if (args.has('--next')) {
    const out = path.join(DIST, 'b', 'next');
    fs.cpSync(path.join(ROOT, 'game'), out, { recursive: true });
    pruneGame(out);
    fs.writeFileSync(
        path.join(out, 'build-info.json'),
        JSON.stringify({ n: 'next', commit: 'working-tree' }, null, 2)
    );
    console.log('build next <- working tree');
}

fs.cpSync(path.join(ROOT, 'hq'), DIST, { recursive: true });

// The Worker bundles this merged manifest (worker/src/manifest.js).
const GEN = path.join(ROOT, 'worker/src/generated');
fs.mkdirSync(GEN, { recursive: true });
fs.writeFileSync(path.join(GEN, 'builds.json'), JSON.stringify({ builds }, null, 2));

fs.writeFileSync(
    path.join(DIST, 'builds.json'),
    JSON.stringify(
        {
            builds: builds.map((b) => ({
                n: b.n,
                title: b.title,
                mode: b.mode,
                commit: b.commit,
                activatesAt: b.activatesAt,
                costUsd: b.costUsd ?? null,
                revoked: !!b.revoked
            }))
        },
        null,
        2
    )
);

const devlog = compileDevlog(ROOT);
fs.writeFileSync(path.join(DIST, 'devlog.json'), JSON.stringify(devlog, null, 2));
console.log(`devlog: ${devlog.entries.length} entr${devlog.entries.length === 1 ? 'y' : 'ies'}`);

// Builds are immutable, so they can be cached forever. The HQ revalidates.
fs.writeFileSync(
    path.join(DIST, '_headers'),
    `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
/b/*
  Cache-Control: public, max-age=31536000, immutable
/assets/*
  Cache-Control: public, max-age=604800
`
);

console.log(`dist ready: ${builds.length} build(s)`);
