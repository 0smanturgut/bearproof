// builds.bearproof.app: the build log. One page, rendered on the server from the main site's own public data
// (devlog.json, /api/stats, /api/vote, through the MAIN service binding) and a few read-only counts from D1.
// Nothing here writes anything. /assets/* (fonts, icon) is passed through to the main site.

const SITE = 'https://bearproof.app';
const REPO = 'https://github.com/0smanturgut/bearproof';
const CACHE_SECONDS = 120;

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname.startsWith('/assets/'))
            return env.MAIN.fetch(new Request(SITE + url.pathname));
        if (url.pathname === '/robots.txt')
            return new Response('User-agent: *\nAllow: /\n', {
                headers: { 'content-type': 'text/plain' }
            });
        if (url.pathname !== '/') return Response.redirect(url.origin + '/', 302);
        const cache = caches.default;
        const key = new Request(url.origin + '/');
        const hit = await cache.match(key);
        if (hit) return hit;
        const res = new Response(await page(env), {
            headers: {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': `public, max-age=${CACHE_SECONDS}`,
                'x-content-type-options': 'nosniff'
            }
        });
        ctx.waitUntil(cache.put(key, res.clone()));
        return res;
    }
};

async function main(env, path) {
    try {
        const r = await env.MAIN.fetch(new Request(SITE + path));
        return r.ok ? await r.json() : null;
    } catch {
        return null;
    }
}

async function one(env, sql) {
    try {
        return (await env.DB.prepare(sql).first()) || {};
    } catch {
        return {};
    }
}

async function data(env) {
    const [devlog, stats, vote, players, runs, paid, busiest] = await Promise.all([
        main(env, '/devlog.json'),
        main(env, '/api/stats'),
        main(env, '/api/vote'),
        one(env, 'SELECT COUNT(*) AS n FROM players'),
        one(env, "SELECT COUNT(*) AS n FROM runs WHERE status = 'verified'"),
        // every paid day was paid in $ANSEM except 28 Sep (SOL), so that one stays out of the token sum
        one(
            env,
            "SELECT SUM(CAST(payout_amount AS INTEGER)) AS raw FROM daily_winners WHERE payout_status = 'paid' AND date <> '2026-09-28'"
        ),
        one(
            env,
            "SELECT challenge_date AS d, COUNT(*) AS n, COUNT(DISTINCT player_id) AS p FROM runs WHERE mode = 'daily' AND status = 'verified' GROUP BY 1 ORDER BY 2 DESC LIMIT 1"
        )
    ]);
    return {
        devlog: devlog?.entries || [],
        stats,
        vote,
        players: players.n,
        runs: runs.n,
        ansem: paid.raw ? paid.raw / 1e6 : null,
        busiest
    };
}

const esc = (s) =>
    String(s ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
const num = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const day = (iso) => {
    const d = new Date(iso + 'T00:00:00Z');
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
// what a build shipped, from the first paragraph of its devlog: no markdown, and none of the sentences about how
// the previous build was played (those numbers are about the night before, not this build)
function lead(e) {
    const p = String(e.body || e.summary || '')
        .split(/\n\s*\n/)[0]
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^Shipped:\s*/i, '')
        .replace(/^Build #\d+:\s*/i, '');
    const out = [];
    for (const sentence of p.match(/[^.!?]+[.!?]+(\s|$)/g) || [p]) {
        if (/of you played|verified runs|median run/i.test(sentence)) break;
        out.push(sentence.trim());
        if (out.length === 2) break;
    }
    const t = out.join(' ') || p;
    return t.charAt(0).toUpperCase() + t.slice(1);
}
const WHO = { agent: 'BUILD AGENT', bootstrap: 'SETUP', upstream: 'ORIGINAL' };

async function page(env) {
    const d = await data(env);
    const builds = d.devlog.filter((e) => e.status !== 'failed').sort((a, b) => b.build - a.build);
    const n = d.stats?.buildsShipped ?? builds[0]?.build ?? 0;
    const next = d.stats?.nextBuildAt || null;
    const v = d.vote;
    const total = (v?.proposals || []).reduce((s, p) => s + (p.weight || 0), 0);
    const ballot = (v?.proposals || [])
        .map((p) => {
            const share = total ? Math.round((100 * (p.weight || 0)) / total) : 0;
            return `<li><div class="opt"><b>${esc(p.title)}</b><span>${p.voters ? `${share}% · ${p.voters} wallet${p.voters === 1 ? '' : 's'}` : 'no votes yet'}</span></div><p>${esc(p.description)}</p><i style="width:${share}%"></i></li>`;
        })
        .join('');
    const open = v?.status === 'open';
    const milestones = [
        ['23 SEP', 'Build #1: an AI takes a free open-source game and turns it into BEARPROOF.'],
        ['24 SEP', 'The first Daily Challenge, with a prize paid on-chain to the winner.'],
        [
            '25 SEP',
            'The Build Agent ships its first build on its own: Pepe joins as a second character.'
        ],
        ['28 SEP', 'The Rug Lord, the first big boss.'],
        d.busiest?.d
            ? [
                  day(d.busiest.d),
                  `The busiest day so far: ${num(d.busiest.n)} runs by ${num(d.busiest.p)} players.`
              ]
            : null,
        [
            '17 OCT',
            'The Market: player levels, CLOUT and skins. From here, every build is a major update on the road to 1.0.'
        ],
        [
            'NEXT',
            'A new character, a new map and missions. Then the App Store, Google Play and Steam.'
        ]
    ].filter(Boolean);
    const cards = builds
        .map((e) => {
            const who = WHO[e.mode] || 'BUILD AGENT';
            const cost =
                e.costUsd != null && e.mode === 'agent'
                    ? `$${Number(e.costUsd).toFixed(2)} of AI compute${e.costMeasured ? '' : ' (estimate)'}`
                    : '';
            return `<article class="b${e.build === n ? ' live' : ''}" id="build-${e.build}">
  <div class="n"><span>NIGHT</span>${e.build}</div>
  <div class="body">
    <div class="meta"><span>${day(e.date)}</span><span class="who ${esc(e.mode)}">${who}</span>${e.build === n ? '<span class="now">LIVE NOW</span>' : ''}${e.chosenBy === 'holders' ? '<span class="voted">PICKED BY HOLDERS</span>' : ''}</div>
    <h3>${esc(e.title)}</h3>
    <p>${esc(lead(e))}</p>
    <div class="links"><a href="${SITE}/b/${e.build}/">Play this build →</a><a href="${REPO}/blob/main/devlog/build-${e.build}.md">Devlog</a>${cost ? `<span>${esc(cost)}</span>` : ''}</div>
  </div>
</article>`;
        })
        .join('\n');
    const desc = `${n} builds in ${n} nights, none skipped. Every BEARPROOF build so far, tonight's vote and what comes next.`;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>BEARPROOF · Build Log</title>
<meta name="description" content="${esc(desc)}" />
<meta property="og:title" content="BEARPROOF · Build Log" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${SITE}/assets/og.png" />
<meta property="og:url" content="https://builds.bearproof.app/" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/svg+xml" href="/assets/bull.svg" />
<style>
@font-face { font-family: 'Jersey 10'; src: url('/assets/fonts/jersey-10.woff2') format('woff2'); font-display: swap; }
@font-face { font-family: 'JetBrains Mono'; src: url('/assets/fonts/jetbrains-mono-400.woff2') format('woff2'); font-display: swap; }
:root { --bg: #05070a; --card: #0b1015; --line: #18222b; --text: #eef4f0; --muted: #75847e; --bull: #16e08a; --gold: #ffc53d; --bear: #ff3b5c; }
* { box-sizing: border-box; }
html { background: var(--bg); }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.6 'JetBrains Mono', ui-monospace, monospace; }
a { color: var(--bull); text-decoration: none; }
a:hover { text-decoration: underline; }
.wrap { max-width: 880px; margin: 0 auto; padding: 0 16px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 22px 0; border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: center; gap: 12px; font: 34px/1 'Jersey 10', monospace; letter-spacing: 0.04em; color: var(--text); }
.brand img { width: 34px; height: 34px; }
.brand small { font: 12px/1 'JetBrains Mono', monospace; letter-spacing: 0.2em; color: var(--muted); }
.play { padding: 10px 16px; background: var(--bull); color: #03140c; font: 22px/1 'Jersey 10', monospace; letter-spacing: 0.04em; white-space: nowrap; }
.play:hover { text-decoration: none; filter: brightness(1.1); }
.hero { padding: 56px 0 30px; text-align: center; }
.hero h1 { margin: 0; font: 400 clamp(54px, 13vw, 116px)/0.86 'Jersey 10', monospace; letter-spacing: 0.01em; }
.hero h1 span { color: var(--bull); text-shadow: 0 0 40px rgba(22, 224, 138, 0.35); }
.hero p { margin: 22px auto 0; max-width: 560px; color: var(--muted); }
.clock { margin-top: 18px; color: var(--gold); letter-spacing: 0.1em; font-size: 13px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 26px 0 8px; }
.stats div { padding: 16px 12px; background: var(--card); border: 1px solid var(--line); text-align: center; }
.stats b { display: block; font: 400 40px/1 'Jersey 10', monospace; color: var(--bull); }
.stats span { display: block; margin-top: 6px; font-size: 11px; letter-spacing: 0.14em; color: var(--muted); text-transform: uppercase; }
h2 { margin: 54px 0 16px; font: 400 40px/1 'Jersey 10', monospace; letter-spacing: 0.03em; }
h2 small { display: block; margin-top: 8px; font: 12px/1.4 'JetBrains Mono', monospace; letter-spacing: 0.12em; color: var(--muted); text-transform: uppercase; }
.tonight { padding: 20px; background: var(--card); border: 1px solid var(--line); }
.tonight ul { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 10px; }
.tonight li { position: relative; padding: 14px 16px; border: 1px solid var(--line); overflow: hidden; }
.tonight li i { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--bull); }
.opt { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.opt b { font: 400 26px/1.1 'Jersey 10', monospace; letter-spacing: 0.02em; }
.opt span { font-size: 12px; color: var(--gold); white-space: nowrap; }
.tonight p, .tonight li p { margin: 6px 0 0; color: var(--muted); font-size: 13px; }
.miles { list-style: none; margin: 0; padding: 0; border-left: 2px solid var(--line); }
.miles li { position: relative; padding: 0 0 18px 22px; }
.miles li::before { content: ''; position: absolute; left: -7px; top: 6px; width: 12px; height: 12px; background: var(--bull); }
.miles li.next::before { background: transparent; border: 2px dashed var(--gold); }
.miles b { display: block; font: 400 20px/1.1 'Jersey 10', monospace; letter-spacing: 0.06em; color: var(--gold); }
.b { display: grid; grid-template-columns: 84px 1fr; gap: 16px; padding: 18px 0; border-top: 1px solid var(--line); }
.b .n { font: 400 54px/0.9 'Jersey 10', monospace; color: var(--bull); text-align: right; }
.b .n span { display: block; font: 10px/1 'JetBrains Mono', monospace; letter-spacing: 0.2em; color: var(--muted); margin-bottom: 4px; }
.b.live { background: linear-gradient(90deg, rgba(22, 224, 138, 0.08), transparent 70%); }
.meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; letter-spacing: 0.14em; color: var(--muted); }
.meta span { padding: 2px 8px; border: 1px solid var(--line); }
.meta .now { color: #03140c; background: var(--bull); border-color: var(--bull); }
.meta .voted { color: var(--gold); border-color: rgba(255, 197, 61, 0.4); }
.meta .bootstrap, .meta .upstream { color: var(--gold); }
.b h3 { margin: 8px 0 4px; font: 400 30px/1.05 'Jersey 10', monospace; letter-spacing: 0.02em; }
.b p { margin: 0; color: #c9d3cf; font-size: 14px; }
.links { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 10px; font-size: 13px; }
.links span { color: var(--muted); }
footer { margin: 60px 0 0; padding: 26px 0 40px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; line-height: 1.7; }
@media (max-width: 560px) { .b { grid-template-columns: 56px 1fr; gap: 12px; } .b .n { font-size: 40px; } .brand { font-size: 28px; } .brand small { display: none; } }
@media (prefers-reduced-motion: no-preference) { .b.live .n { animation: pulse 2.4s ease-in-out infinite; } @keyframes pulse { 50% { text-shadow: 0 0 24px rgba(22, 224, 138, 0.6); } } }
</style>
</head>
<body>
<div class="wrap">
<header>
  <a class="brand" href="${SITE}"><img src="/assets/bull.svg" alt="" />BEARPROOF <small>BUILD LOG</small></a>
  <a class="play" href="${SITE}">PLAY FREE →</a>
</header>
<section class="hero">
  <h1>${n} NIGHTS.<br /><span>${n} BUILDS.</span></h1>
  <p>An AI builds this game in public. Every night it ships a new version, tests it and writes a devlog. Not one night skipped since 23 Sep.</p>
  ${next ? `<div class="clock" id="clock" data-at="${esc(next)}">NEXT BUILD AT 00:00 UTC</div>` : ''}
</section>
<div class="stats">
  <div><b>${num(n)}</b><span>Builds shipped</span></div>
  <div><b>${num(d.players)}</b><span>Players</span></div>
  <div><b>${num(d.runs)}</b><span>Runs re-played by the server</span></div>
  <div><b>${num(d.ansem)}</b><span>ANSEM paid to players</span></div>
</div>

<h2>Tonight<small>${open ? `Build #${esc(v.forBuild)} · holders are voting · closes 21:00 UTC` : v ? `Build #${esc(v.forBuild)} · the vote is closed, the AI is building` : 'The next build ships at 00:00 UTC'}</small></h2>
<div class="tonight">
  <p>Every evening the AI proposes three features and holders vote with a free wallet signature. Overnight it builds the winner, or its own pick when nobody votes.</p>
  ${ballot ? `<ul>${ballot}</ul>` : ''}
</div>

<h2>Milestones</h2>
<ul class="miles">
${milestones.map(([w, t]) => `  <li${w === 'NEXT' ? ' class="next"' : ''}><b>${esc(w)}</b>${esc(t)}</li>`).join('\n')}
</ul>

<h2>Every build<small>Newest first · each one still playable</small></h2>
${cards}

<footer>
  BEARPROOF started from canvas-vampire-survivors by ricardo-foundry (MIT licence), kept as Build #0 so anyone can see what the AI added: <a href="${SITE}/b/0/">play the original</a>.<br />
  Builds #1 and #2 were setup builds made with the founder; every build from #3 on was written by the Build Agent. Numbers on this page are read live from bearproof.app.<br />
  <a href="${SITE}">bearproof.app</a> · <a href="https://t.me/bearproofapp">Telegram</a> · <a href="${REPO}">Source</a>
</footer>
</div>
<script>
(function () {
  var el = document.getElementById('clock'); if (!el) return;
  var at = Date.parse(el.dataset.at);
  function tick() {
    var s = Math.max(0, Math.floor((at - Date.now()) / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    el.textContent = s ? 'NEXT BUILD IN ' + h + 'H ' + String(m).padStart(2, '0') + 'M ' + String(x).padStart(2, '0') + 'S' : 'THE NEXT BUILD IS SHIPPING';
  }
  tick(); setInterval(tick, 1000);
})();
</script>
</body>
</html>`;
}
