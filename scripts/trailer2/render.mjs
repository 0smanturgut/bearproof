// Renders the composer (composer/index.html) frame by frame in headless Chromium and pipes the frames to ffmpeg.
// The page is a pure function of the frame number, so the output is the same on every run.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../lib/browser.mjs';
import { startServer } from './lib/server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

export const SIZES = { '16x9': [1920, 1080], '9x16': [1080, 1920] };

export function readMeta(work, aspect) {
    const dir = path.join(work, 'footage', aspect);
    const meta = {};
    if (!fs.existsSync(dir)) return meta;
    for (const id of fs.readdirSync(dir)) {
        const f = path.join(dir, id, 'meta.json');
        if (fs.existsSync(f)) meta[id] = JSON.parse(fs.readFileSync(f, 'utf8'));
    }
    return meta;
}

/** Open the composer for one aspect. Returns { page, info, close }. */
export async function openComposer({ work, data, aspect }) {
    const [W, H] = SIZES[aspect];
    const srv = await startServer({
        mounts: [
            ['/b/', path.join(ROOT, 'dist/b')],
            ['/fonts/', path.join(ROOT, 'game/assets/fonts')],
            ['/composer/', path.join(HERE, 'composer')],
            ['/footage/', path.join(work, 'footage')]
        ]
    });
    const browser = await launch('chromium');
    const ctx = await browser.newContext({
        viewport: { width: W, height: H },
        deviceScaleFactor: 1
    });
    await ctx.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.abort());
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${srv.base}/composer/index.html`);
    await page.waitForFunction(() => typeof window.setup === 'function');
    const info = await page.evaluate((o) => window.setup(o), {
        W,
        H,
        aspect,
        D: data,
        meta: readMeta(work, aspect)
    });
    const cdp = await ctx.newCDPSession(page);
    const shot = async (type = 'jpeg') => {
        const r = await cdp.send('Page.captureScreenshot', {
            format: type,
            ...(type === 'jpeg' ? { quality: 95 } : {}),
            optimizeForSpeed: true,
            clip: { x: 0, y: 0, width: W, height: H, scale: 1 }
        });
        return Buffer.from(r.data, 'base64');
    };
    return {
        page,
        info,
        errors,
        W,
        H,
        shot,
        close: async () => {
            await browser.close();
            srv.close();
        }
    };
}

/** Render some frames to PNG files (for checking a scene). */
export async function renderStills({ work, data, aspect, frames, outDir }) {
    const c = await openComposer({ work, data, aspect });
    fs.mkdirSync(outDir, { recursive: true });
    const files = [];
    try {
        for (const f of frames) {
            // scenes animate from their own start, so render the few frames before too (some effects decay)
            const id = await c.page.evaluate((f) => window.render(f), f);
            const file = path.join(outDir, `${aspect}-${String(f).padStart(4, '0')}-${id}.png`);
            fs.writeFileSync(file, await c.shot('png'));
            files.push(file);
        }
    } finally {
        if (c.errors.length) console.warn('composer errors:', c.errors.slice(0, 5));
        await c.close();
    }
    return files;
}

/** Render every frame and encode a silent H.264 video. */
export async function renderVideo({
    work,
    data,
    aspect,
    out,
    from = 0,
    to = null,
    log = console.log
}) {
    const c = await openComposer({ work, data, aspect });
    const total = to ?? c.info.frames;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const ff = spawn(
        'ffmpeg',
        [
            '-y',
            '-loglevel',
            'error',
            '-f',
            'image2pipe',
            '-framerate',
            '60',
            '-c:v',
            'mjpeg',
            '-i',
            '-',
            // Chrome's JPEGs are full-range BT.601; the web expects limited-range BT.709
            '-vf',
            'scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p',
            '-colorspace',
            'bt709',
            '-color_primaries',
            'bt709',
            '-color_trc',
            'bt709',
            '-color_range',
            'tv',
            '-c:v',
            'libx264',
            '-preset',
            'slow',
            '-crf',
            '17',
            '-profile:v',
            'high',
            '-pix_fmt',
            'yuv420p',
            '-r',
            '60',
            '-movflags',
            '+faststart',
            out
        ],
        { stdio: ['pipe', 'inherit', 'inherit'] }
    );
    const done = new Promise((res, rej) =>
        ff.on('close', (code) => (code ? rej(new Error(`ffmpeg ${code}`)) : res()))
    );
    const t0 = Date.now();
    try {
        for (let f = from; f < total; f++) {
            await c.page.evaluate((f) => window.render(f), f);
            const buf = await c.shot('jpeg');
            if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
            if (f % 300 === 0)
                log(`  ${aspect} frame ${f}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
        }
    } finally {
        ff.stdin.end();
        if (c.errors.length) console.warn('composer errors:', c.errors.slice(0, 5));
        await c.close();
    }
    await done;
    return out;
}

/** Render the soundtrack (the same for every aspect) to a WAV file. */
export async function renderAudio({ work, data, out }) {
    const c = await openComposer({ work, data, aspect: '16x9' });
    try {
        const b64 = await c.page.evaluate(
            async (meta) => {
                const { renderMusic, wavBase64 } = await import('/composer/music.js');
                const buf = await renderMusic({ scenes: window.timeline().scenes, meta });
                return wavBase64(buf);
            },
            readMeta(work, '16x9')
        );
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, Buffer.from(b64, 'base64'));
    } finally {
        if (c.errors.length) console.warn('composer errors:', c.errors.slice(0, 5));
        await c.close();
    }
    return out;
}
