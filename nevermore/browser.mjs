/**
 * @module nevermore/browser
 * @description A closed browser: a local static server and a Chromium context in which every request that is not
 * to that server is aborted. Used by `run.mjs --browser` and by Muninn's reproduction tool.
 * Needs `playwright` (BEARPROOF and Muninn both have it); imported lazily so the headless runner never needs it.
 */

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.woff2': 'font/woff2',
    '.ogg': 'audio/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.txt': 'text/plain; charset=utf-8'
};

/**
 * Serve directories under URL prefixes on 127.0.0.1 (random port). `stubs` maps exact paths to JSON bodies
 * (e.g. the game's `/api/daily`); any other `/api/*` answers 503 so the game falls back to offline play.
 * @param {Record<string, string>} mounts e.g. { '/': gameDir, '/nevermore/': nevermoreDir }
 * @param {{ stubs?: Record<string, unknown>, pages?: Record<string, string> }} [opts]
 */
export async function serveStatic(mounts, { stubs = {}, pages = {} } = {}) {
    const entries = Object.entries(mounts).sort((a, b) => b[0].length - a[0].length);
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const p = decodeURIComponent(url.pathname);
        if (Object.prototype.hasOwnProperty.call(pages, p))
            return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(pages[p]);
        if (Object.prototype.hasOwnProperty.call(stubs, p))
            return res
                .writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
                .end(JSON.stringify(stubs[p]));
        if (p.startsWith('/api/'))
            return res.writeHead(503, { 'content-type': 'application/json' }).end('{}');
        for (const [prefix, root] of entries) {
            if (!p.startsWith(prefix)) continue;
            const rel = p.slice(prefix.length) || 'index.html';
            const file = path.resolve(root, rel.endsWith('/') ? rel + 'index.html' : rel);
            if (!file.startsWith(path.resolve(root) + path.sep) && file !== path.resolve(root))
                break;
            if (!fs.existsSync(file) || !fs.statSync(file).isFile()) break;
            return res
                .writeHead(200, {
                    'content-type': MIME[path.extname(file)] || 'application/octet-stream',
                    'cache-control': 'no-store'
                })
                .end(fs.readFileSync(file));
        }
        res.writeHead(404).end();
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    return { origin, close: () => new Promise((r) => server.close(r)) };
}

function newestHeadlessShell() {
    const cache =
        process.env.PLAYWRIGHT_BROWSERS_PATH ||
        path.join(os.homedir(), 'Library/Caches/ms-playwright');
    if (!fs.existsSync(cache)) return null;
    const dirs = fs
        .readdirSync(cache)
        .filter((d) => d.startsWith('chromium_headless_shell-'))
        .sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()));
    for (const d of dirs)
        for (const rel of [
            'chrome-headless-shell-mac-arm64/chrome-headless-shell',
            'chrome-headless-shell-mac-x64/chrome-headless-shell',
            'chrome-headless-shell-linux64/chrome-headless-shell'
        ]) {
            const exe = path.join(cache, d, rel);
            if (fs.existsSync(exe)) return exe;
        }
    return null;
}

/** Launch Chromium; if Playwright's pinned revision isn't installed, fall back to the newest cached one. */
export async function launchChromium() {
    let pw;
    try {
        pw = await import('playwright');
    } catch {
        throw new Error('--browser needs the playwright package');
    }
    try {
        return await pw.chromium.launch();
    } catch (err) {
        const exe = newestHeadlessShell();
        if (!exe) throw err;
        return pw.chromium.launch({ executablePath: exe });
    }
}

/**
 * A new context where every request outside `origin` is aborted and counted.
 * @returns {Promise<{ context: any, blocked: string[] }>}
 */
export async function closedContext(browser, origin, options = {}) {
    const context = await browser.newContext({ serviceWorkers: 'block', ...options });
    const blocked = [];
    await context.route('**/*', (route) => {
        const u = route.request().url();
        if (u.startsWith(origin + '/') || u === origin) return route.continue();
        if (u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
        blocked.push(u.slice(0, 120));
        return route.abort('blockedbyclient');
    });
    return { context, blocked };
}
