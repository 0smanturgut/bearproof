/**
 * Shareable runs.
 *
 *   GET /run/<id>          a small page with Open Graph tags, so a shared run unfurls as its card on X
 *   GET /og/run/<id>.png   the 1200×630 card (worker/src/og/card.js), cached at the edge
 *
 * The card shows the claimed score and, next to it, the replay status. A run that is still pending says so.
 */

import { dayNumber, utcDate } from '../lib/daily.js';
import { clientIp, ipKey, underLimit } from '../lib/guard.js';
import { error } from '../lib/http.js';
import { drawCard, headline, statusLine } from '../og/card.js';
import { loadRun } from './runs.js';

const FINAL = new Set(['verified', 'rejected', 'unverifiable']);

const esc = (s) =>
    String(s).replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
const fmtNum = (n) =>
    String(Math.max(0, Math.floor(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

async function withDay(id, env) {
    const run = await loadRun(id, env);
    if (run) run.day = dayNumber(env.PROJECT_START_DATE, Date.parse(run.createdAt));
    return run;
}

export async function runCard(id, env, request) {
    // Only cache misses get here; drawing costs CPU, so misses are rate limited per IP.
    if (!(await underLimit(env.RL_READ, `og:${await ipKey(clientIp(request))}`)))
        return error(429, 'rate_limited', 'Too many requests. Try again in a minute.');
    const run = await withDay(id, env);
    if (run === null) return error(503, 'db_unavailable', 'Storage is unavailable.');
    if (!run) return error(404, 'not_found', 'No such run.');
    const png = await drawCard(run).png();
    return new Response(png, {
        headers: {
            'content-type': 'image/png',
            // The status is part of the URL (?v=), so a final card can be cached for a long time.
            'cache-control': FINAL.has(run.status)
                ? 'public, max-age=604800, immutable'
                : 'public, max-age=300'
        }
    });
}

export async function runPage(id, env, origin) {
    const run = await withDay(id, env);
    if (run === null) return error(503, 'db_unavailable', 'Storage is unavailable.');
    if (!run) return Response.redirect(`${origin}/play`, 302);
    const daily = run.mode === 'daily' && run.challengeDate;
    const today = utcDate(Date.now());
    const title = `Score ${fmtNum(run.score)} on BEARPROOF Build #${run.build}`;
    const what = daily ? `the Daily Challenge of ${run.challengeDate}` : 'a free run';
    const desc = `${headline(run)
        .toLowerCase()
        .replace(/^./, (c) =>
            c.toUpperCase()
        )} in ${what}. A game an AI builds every day. Free, no wallet.`;
    // v: the status, plus the card's own version (2: the run's character), so a redrawn card isn't served stale.
    const img = `${origin}/og/run/${run.id}.png?v=${run.status}-2`;
    const playHref = daily && run.challengeDate === today ? `/play?challenge=${today}` : '/play';
    const playLabel =
        daily && run.challengeDate === today ? 'Beat it today' : "Play today's challenge";
    const status = statusLine(run)[0]
        .replace(/^✓ /, '')
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase());
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(`${origin}/run/${run.id}`)}">
<link rel="icon" type="image/svg+xml" href="/assets/bull.svg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="BEARPROOF">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(`${origin}/run/${run.id}`)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@bearproofapp">
<meta name="theme-color" content="#07090C">
<style>
@font-face{font-family:'Jersey 10';src:url('/assets/fonts/jersey-10.woff2') format('woff2');font-display:swap}
:root{color-scheme:dark}
html,body{margin:0;background:#07090C;color:#E8EDF2;font:15px/1.5 ui-monospace,Menlo,monospace}
main{max-width:720px;margin:0 auto;padding:24px 16px 48px}
img{display:block;width:100%;height:auto;border:1px solid #1B222B}
h1{font:400 40px/1 'Jersey 10',monospace;margin:24px 0 8px}
p{margin:0 0 12px;color:#A3ACB8}
.row{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px}
a.btn{display:inline-flex;align-items:center;min-height:48px;padding:0 20px;font:400 24px/1 'Jersey 10',monospace;text-decoration:none;border:2px solid #16E08A;color:#16E08A}
a.btn.primary{background:#16E08A;color:#07090C}
.fine{font-size:12px;color:#7D8896}
</style>
</head>
<body>
<main>
<img src="${esc(img)}" width="1200" height="630" alt="${esc(`${title}. ${headline(run)}. ${status}.`)}">
<h1>${esc(title)}</h1>
<p>${esc(desc)}</p>
<p class="fine">${esc(status)}. Every score is re-simulated on the server from its input log before it can rank.</p>
<div class="row">
<a class="btn primary" href="${esc(playHref)}">${esc(playLabel)}</a>
<a class="btn" href="/">See what the AI built</a>
</div>
</main>
</body>
</html>`;
    return new Response(html, {
        headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'public, max-age=60'
        }
    });
}
