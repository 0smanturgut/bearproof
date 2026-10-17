#!/usr/bin/env node
/**
 * Preview the HQ with live data:   node scripts/hq-dev.mjs [--port 8790]
 *
 * Serves hq/ from the working tree (and game/src/art at /art, like scripts/build.mjs), and forwards every
 * other GET (the API, /play, /b/<n>/, devlog.json) to https://bearproof.app. Writes never leave this
 * machine: any other method answers 405, so trying a vote or an idea here can't touch production data.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM = 'https://bearproof.app';
const i = process.argv.indexOf('--port');
const PORT = i > 0 ? Number(process.argv[i + 1]) : 8790;

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.mp4': 'video/mp4',
    '.woff2': 'font/woff2',
    '.xml': 'application/xml',
    '.txt': 'text/plain; charset=utf-8'
};

function local(pathname) {
    const clean = path.posix.normalize(decodeURIComponent(pathname));
    if (clean.includes('..')) return null;
    const candidates = clean.startsWith('/art/')
        ? [path.join(ROOT, 'game/src', clean)]
        : [
              path.join(ROOT, 'hq', clean),
              path.join(ROOT, 'hq', clean, 'index.html'),
              path.join(ROOT, 'hq', `${clean}.html`)
          ];
    return candidates.find((f) => fs.existsSync(f) && fs.statSync(f).isFile()) || null;
}

http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'content-type': 'application/json' });
        res.end(
            JSON.stringify({ ok: false, error: { message: 'Preview server: writes are off.' } })
        );
        return;
    }
    const file = local(url.pathname);
    if (file) {
        res.writeHead(200, {
            'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
            'cache-control': 'no-store'
        });
        fs.createReadStream(file).pipe(res);
        return;
    }
    try {
        const up = await fetch(UPSTREAM + url.pathname + url.search, { redirect: 'manual' });
        const headers = {};
        for (const [k, v] of up.headers) {
            if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k))
                headers[k] = v;
        }
        if (headers.location) headers.location = headers.location.replace(UPSTREAM, '');
        res.writeHead(up.status, headers);
        res.end(Buffer.from(await up.arrayBuffer()));
    } catch (e) {
        res.writeHead(502, { 'content-type': 'text/plain' });
        res.end(`upstream error: ${e.message}`);
    }
}).listen(PORT, () =>
    console.log(`HQ preview on http://localhost:${PORT} (data from ${UPSTREAM})`)
);
