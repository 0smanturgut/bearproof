// A tiny local static server for the trailer: every shipped build (dist/b/<n>/), the HQ (dist/), the composer
// and the captured footage. /api/* answers from a snapshot of the live API taken at the start of the render, so
// nothing the recorder does ever reaches production (no sessions, no runs, no votes).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.mp4': 'video/mp4',
    '.txt': 'text/plain; charset=utf-8'
};

/**
 * @param {{ mounts: Array<[string, string]>, api?: (url: URL, method: string) => any }} opts
 *   mounts: [urlPrefix, directory], longest prefix wins.
 */
export async function startServer({ mounts, api = () => null }) {
    const sorted = [...mounts].sort((a, b) => b[0].length - a[0].length);
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://x');
        if (url.pathname.startsWith('/api/')) {
            const body = req.method === 'GET' ? api(url, req.method) : { ok: true, id: 'trailer' };
            res.writeHead(body == null ? 404 : 200, {
                'content-type': 'application/json',
                'cache-control': 'no-store'
            });
            return res.end(JSON.stringify(body ?? { error: { code: 'not_found' } }));
        }
        const hit = sorted.find(([p]) => url.pathname.startsWith(p));
        if (!hit) return res.writeHead(404).end();
        let rel = decodeURIComponent(url.pathname.slice(hit[0].length));
        let file = path.join(hit[1], rel);
        if (!file.startsWith(path.resolve(hit[1]))) return res.writeHead(403).end();
        if (fs.existsSync(file) && fs.statSync(file).isDirectory())
            file = path.join(file, 'index.html');
        if (!fs.existsSync(file)) return res.writeHead(404).end();
        res.writeHead(200, {
            'content-type': MIME[path.extname(file)] || 'application/octet-stream',
            'cache-control': 'no-store'
        });
        fs.createReadStream(file).pipe(res);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    return {
        server,
        base: `http://127.0.0.1:${server.address().port}`,
        close: () => server.close()
    };
}
