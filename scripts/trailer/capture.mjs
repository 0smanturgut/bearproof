// Records gameplay footage from the real builds, frame by frame, on a virtual clock (lib/vclock.js): every frame
// is rendered by the build's own code at exactly 1/60 s, however long the screenshot takes. Output per shot:
// <work>/footage/<aspect>/<shot>/0000.jpg ... and meta.json (frame count, size, the game's own SFX calls by
// frame, so the soundtrack can play them in sync).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../lib/browser.mjs';
import { startServer } from './lib/server.mjs';
import { shotsFor } from './shots.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const FPS = 60;

export const ASPECTS = {
    '16x9': { css: [1280, 720], dsf: 2 },
    '9x16': { css: [720, 1280], dsf: 2 }
};

/** The API the builds see: today's challenge and board from the snapshot, every write swallowed. */
function mockApi(data) {
    return (url) => {
        if (url.pathname === '/api/daily')
            return {
                ...data.daily,
                endsAt: data.nextBuildAt,
                prize: { token: 'ANSEM', status: 'live', policy: 'daily-pot' }
            };
        if (url.pathname === '/api/leaderboard') return { board: 'daily', rows: data.board };
        if (url.pathname === '/api/stats') return { day: data.day };
        return { ok: true, rows: [] };
    };
}

export async function capture({ work, data, aspects = ['16x9'], only = null, log = console.log }) {
    const srv = await startServer({
        mounts: [['/b/', path.join(ROOT, 'dist/b')]],
        api: mockApi(data)
    });
    const browser = await launch('chromium');
    const vclock = fs.readFileSync(path.join(HERE, 'lib/vclock.js'), 'utf8');
    const director = fs.readFileSync(path.join(HERE, 'lib/director.js'), 'utf8');
    try {
        for (const aspect of aspects) {
            const A = ASPECTS[aspect];
            for (const shot of shotsFor(data)) {
                if (only && !only.includes(shot.id)) continue;
                const dir = path.join(work, 'footage', aspect, shot.id);
                fs.rmSync(dir, { recursive: true, force: true });
                fs.mkdirSync(dir, { recursive: true });
                const t0 = Date.now();
                const meta = await recordShot({
                    browser,
                    srv,
                    shot,
                    A,
                    aspect,
                    dir,
                    vclock,
                    director,
                    data
                });
                fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
                log(
                    `  ${aspect} ${shot.id.padEnd(12)} ${meta.frames} frames  ${((Date.now() - t0) / 1000).toFixed(1)}s` +
                        (meta.errors.length ? `  (${meta.errors.length} page errors)` : '')
                );
            }
        }
    } finally {
        await browser.close();
        srv.close();
    }
}

async function recordShot({ browser, srv, shot, A, aspect, dir, vclock, director, data }) {
    const V = shot.viewport || A;
    const [w, h] = V.css;
    const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        deviceScaleFactor: V.dsf,
        reducedMotion: 'no-preference'
    });
    // Nothing leaves the machine: no Turnstile, no fonts from the web, no API.
    await ctx.route(/^(?!http:\/\/127\.0\.0\.1)/, (r) => r.abort());
    await ctx.addInitScript(
        `window.__VT_SEED__ = ${shot.seed >>> 0}; window.__VT_EPOCH__ = ${Date.parse(shot.epoch || '2026-09-27T12:00:00Z')};\n` +
            vclock
    );
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${srv.base}/b/${shot.build}/${shot.query || ''}`);
    const step = (ms = 1000 / FPS) => page.evaluate((ms) => window.__vt.step(ms), ms);
    const ready = shot.ready || (() => !!window.__bearproof);
    for (let i = 0; i < 600; i++) {
        await step(50);
        if (await page.evaluate(ready)) break;
    }
    await page.evaluate(() => document.fonts.ready);
    for (let i = 0; i < 20; i++) await step(50);
    await page.addScriptTag({ content: director });

    // Hide the HUD for clean shots; keep it for the "this is the real game" ones.
    const css = [
        '#hint{display:none!important}',
        shot.hud === false ? '#hud,#loadout,#bossbar,#vignette{display:none!important}' : '',
        shot.css || ''
    ].join('\n');
    await page.addStyleTag({ content: css });

    // Same seed, same run, in every aspect: the title screen's backdrop used Math.random a viewport-dependent
    // number of times before this point.
    await page.evaluate((n) => window.__vt.reseed(n), shot.seed >>> 0);
    // Scene setup runs inside the page (it can import the build's own modules).
    const setup = shot.setup
        ? await page.evaluate(shot.setup, {
              ...shot.args,
              aspect,
              data: shot.data ? shot.data(data) : null
          })
        : null;

    // Warm-up frames that are rendered but not kept (camera settles, toasts clear).
    for (let i = 0; i < (shot.warmup ?? 30); i++) {
        if (shot.tick) await page.evaluate(shot.tick, shot.args || {});
        await step();
    }
    await page.evaluate(() => {
        window.__sfxLog = [];
        window.__sfxT0 = performance.now();
    });

    const cdp = await ctx.newCDPSession(page);
    const frames = Math.round((shot.seconds || 3) * FPS);
    for (let i = 0; i < frames; i++) {
        if (shot.tick) await page.evaluate(shot.tick, shot.args || {});
        await step();
        const r = await cdp.send('Page.captureScreenshot', {
            format: 'jpeg',
            quality: 93,
            optimizeForSpeed: true,
            clip: { x: 0, y: 0, width: w, height: h, scale: V.dsf }
        });
        fs.writeFileSync(
            path.join(dir, `${String(i).padStart(4, '0')}.jpg`),
            Buffer.from(r.data, 'base64')
        );
    }
    const sfx = await page.evaluate(() =>
        (window.__sfxLog || []).map((e) => ({
            f: Math.max(0, Math.round(((e.t - window.__sfxT0) / 1000) * 60) - 1),
            n: e.n
        }))
    );
    const info = shot.info ? await page.evaluate(shot.info) : null;
    await ctx.close();
    return {
        id: shot.id,
        build: shot.build,
        aspect,
        frames,
        fps: FPS,
        size: [w * V.dsf, h * V.dsf],
        sfx,
        setup,
        info,
        errors
    };
}
