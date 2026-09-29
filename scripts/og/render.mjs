#!/usr/bin/env node
// Render the static brand images from the HTML templates in scripts/og/, drawn with the game's own sprites.
// Usage: node scripts/og/render.mjs
//   → hq/assets/og.png                       1200×630 social card (hq-card.html)
//   → hq/assets/brand/{coin,avatar,banner}.png  launch package (brand/*.html)
//   → hq/assets/brand/article-cover.png      1500×600 X Article cover (brand/article.html)
//   → content/x/img/*.png                    1600×900 images for X posts (x/*.html)
// Pass names to render only some: node scripts/og/render.mjs article-cover
// Icons (favicon, touch icons) come from scripts/og/emblem.mjs.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../lib/browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const MIME = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.css': 'text/css',
    '.woff2': 'font/woff2'
};
const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream'
    }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
fs.mkdirSync(path.join(root, 'hq/assets/brand'), { recursive: true });

const jobs = [
    ['scripts/og/hq-card.html', 'hq/assets/og.png', 1200, 630],
    ['scripts/og/brand/coin.html', 'hq/assets/brand/coin.png', 1000, 1000],
    ['scripts/og/brand/avatar.html', 'hq/assets/brand/avatar.png', 400, 400],
    ['scripts/og/brand/banner.html', 'hq/assets/brand/banner.png', 1500, 500],
    ['scripts/og/brand/article.html', 'hq/assets/brand/article-cover.png', 1500, 600],
    // Images for X posts (content/x/), 16:9.
    ['scripts/og/x/compare.html', 'content/x/img/01-day0-vs-day2.png', 1600, 900],
    ['scripts/og/x/roster.html', 'content/x/img/02-meet-the-bear-market.png', 1600, 900],
    ['scripts/og/x/bosses.html', 'content/x/img/03-pick-your-nightmare.png', 1600, 900],
    ['scripts/og/x/gates.html', 'content/x/img/04-tonight-i-code-alone.png', 1600, 900],
    ['scripts/og/x/ballot.html', 'content/x/img/07-tonights-ballot.png', 1600, 900],
    [
        'scripts/og/x/pipeline.html?state=running',
        'content/x/img/10-build3-in-progress.png',
        1600,
        900
    ],
    ['scripts/og/x/pipeline.html?state=green', 'content/x/img/11-build3-all-green.png', 1600, 900],
    ['scripts/og/x/pipeline.html?state=red', 'content/x/img/11-build3-gate-red.png', 1600, 900],
    ['scripts/og/x/green.html', 'content/x/img/14-green-candles.png', 1600, 900],
    ['scripts/og/x/flying.html', 'content/x/img/15-bproof-is-flying.png', 1600, 900],
    ['scripts/og/x/live.html', 'content/x/img/16-watch-the-ai-build.png', 1600, 900],
    ['scripts/og/x/player2.html', 'content/x/img/17-player-2-incoming.png', 1600, 900],
    ['scripts/og/x/board.html', 'content/x/img/18-166051-fell.png', 1600, 900],
    ['scripts/og/x/insights.html', 'content/x/img/19-what-your-runs-told-me.png', 1600, 900],
    ['scripts/og/x/tonight.html', 'content/x/img/20-tonight-on-bearproof.png', 1600, 900],
    ['scripts/og/x/receipt3.html', 'content/x/img/30-build3-receipt.png', 1600, 900],
    ['scripts/og/x/disclosure3.html', 'content/x/img/31-build3-who-did-what.png', 1600, 900],
    ['scripts/og/x/ballot4.html', 'content/x/img/32-build4-ballot.png', 1600, 900],
    ['scripts/og/x/notes.html', 'content/x/img/33-a-note-i-left-myself.png', 1600, 900],
    ['scripts/og/x/stack.html', 'content/x/img/34-what-i-run-on.png', 1600, 900],
    [
        'scripts/og/x/winner.html?day=2&date=24%20SEP&name=xxx&score=222%2C261&time=20%3A00&amount=78.82&sol=0.1033&tx=2Ugj%E2%80%A6mgEv',
        'content/x/img/37-first-ansem-prize.png',
        1600,
        900
    ],
    [
        'scripts/og/x/winner.html?day=3&date=25%20SEP&head=THE%20SECOND&voice=operator&name=xxx&score=193%2C849&time=20%3A00&amount=15.34&sol=0.0234&tx=3bhF%E2%80%A6WrhW',
        'content/x/img/40-day3-winner.png',
        1600,
        900
    ],
    [
        'scripts/og/x/receipt.html?kicker=ON%20TODAY%27S%20BALLOT%20%C2%B7%20VOTE%20CLOSES%2021%3A00%20UTC&t1=THE%20DAILY&t2=POT&amt=40%25%20OF%20CREATOR%20FEES&f1=60%25%20%E2%86%92%20the%20Daily%20top%2010&f2=40%25%20%E2%86%92%20all%20who%20clear%20the%20bounty&f3=paid%20in%20%24ANSEM&w1=Creator%20fees&w2=prize%20pool&w3=players&foot=Free%20to%20play%2C%20no%20coin%20needed%20to%20win%20%C2%B7%20put%20on%20the%20ballot%20by%20the%20operator%2C%20holders%20decide',
        'content/x/img/43-daily-pot.png',
        1600,
        900
    ],
    ['scripts/og/x/regress6.html', 'content/x/img/55-build6-regression-check.png', 1600, 900],
    ['scripts/og/x/ballot7.html', 'content/x/img/56-build7-ballot.png', 1600, 900],
    ['scripts/og/x/builds.html', 'content/x/img/57-six-builds-six-days.png', 1600, 900],
    ['scripts/og/x/judges-note.html', 'content/x/img/61-note-for-the-judges.png', 1600, 900],
    ['scripts/og/x/regress7.html', 'content/x/img/63-build7-regression-check.png', 1600, 900],
    ['scripts/og/x/ballot8.html', 'content/x/img/64-build8-ballot.png', 1600, 900],
    ['scripts/og/x/builds7.html', 'content/x/img/65-seven-days-seven-builds.png', 1600, 900],
    ['scripts/og/x/hero7.html', 'content/x/img/70-an-ai-agent-that-ships-daily.png', 1600, 900],
    [
        'scripts/og/x/race.html?d=%7B%22kicker%22%3A%22TONIGHT%27S%20DAILY%20%C2%B7%20BEAR%20TRAP%20%2B%20FLASH%20CRASH%22%2C%22title%22%3A%22CAN%20ANYONE%20CATCH%22%2C%22titleGreen%22%3A%22TZAE%3F%22%2C%22sub%22%3A%22Tzae%20won%20the%20last%20two%20Dailies.%20Same%20seed%20for%20everyone%2C%20every%20run%20replayed%20on%20the%20server%2C%20and%20the%20pot%20is%20paid%20in%20%3Cb%3E%24ANSEM%3C/b%3E%20after%2000%3A10%20UTC.%22%2C%22clock%22%3A%22BOARD%20CLOSES%2000%3A00%20UTC%22%2C%22boardHead%22%3A%22THE%20BOARD%20%C2%B7%2022%3A42%20UTC%22%2C%22rows%22%3A%5B%7B%22rank%22%3A1%2C%22name%22%3A%22Tzae%22%2C%22meta%22%3A%2216%3A19%20survived%20%C2%B7%20level%2039%22%2C%22score%22%3A%22314%2C685%22%7D%2C%7B%22rank%22%3A2%2C%22name%22%3A%22cpcp%22%2C%22meta%22%3A%2212%3A53%20survived%20%C2%B7%20level%2036%22%2C%22score%22%3A%22223%2C032%22%7D%2C%7B%22rank%22%3A3%2C%22name%22%3A%22YUNG_TREE_STUMP%22%2C%22meta%22%3A%2211%3A21%20survived%20%C2%B7%20level%2034%22%2C%22score%22%3A%22150%2C694%22%7D%2C%7B%22rank%22%3A4%2C%22name%22%3A%22JAG%22%2C%22meta%22%3A%2213%3A17%20survived%20%C2%B7%20level%2034%22%2C%22score%22%3A%22142%2C249%22%7D%2C%7B%22rank%22%3A5%2C%22name%22%3A%22anon-a901%22%2C%22meta%22%3A%221%3A17%20survived%20%C2%B7%20level%209%22%2C%22score%22%3A%221%2C775%22%7D%5D%2C%22foot%22%3A%2210%20players%20on%20today%27s%20board%20%C2%B7%20free%20to%20play%2C%20no%20wallet%20%C2%B7%20bearproof.app%22%7D',
        'content/x/img/69-daily-last-call.png',
        1600,
        900
    ],
    [
        'scripts/og/x/pot.html?d=%7B%22kicker%22%3A%22THE%20FIRST%20ONE%20%C2%B7%2027%20SEP%20DAILY%20%C2%B7%20PAID%2028%20SEP%2C%2000%3A15%20UTC%22%2C%22total%22%3A%2273.791%22%2C%22sol%22%3A%22bought%20with%20%3Cem%3E0.0999%20SOL%3C/em%3E%20in%20one%20swap%3A%2040%25%20of%20the%20day%27s%20creator%20fees%22%2C%22rows%22%3A%5B%7B%22tag%22%3A%22%231%22%2C%22name%22%3A%22Tzae%22%2C%22note%22%3A%22298%2C799%20points%22%2C%22amount%22%3A%2220.754%20%3Ci%3E%24ANSEM%3C/i%3E%22%7D%2C%7B%22tag%22%3A%22%232%22%2C%22name%22%3A%22YUNG_TREE_STUMP%22%2C%22note%22%3A%22157%2C222%20points%22%2C%22amount%22%3A%2213.836%20%3Ci%3E%24ANSEM%3C/i%3E%22%7D%2C%7B%22tag%22%3A%22%233%22%2C%22name%22%3A%22JAG%22%2C%22note%22%3A%22137%2C025%20points%22%2C%22amount%22%3A%229.685%20%3Ci%3E%24ANSEM%3C/i%3E%22%7D%2C%7B%22tag%22%3A%22BOUNTY%22%2C%22bounty%22%3Atrue%2C%22name%22%3A%22Tzae%22%2C%22note%22%3A%22cleared%20Triple%20Top%3A%203%20bosses%2C%20one%20run%22%2C%22amount%22%3A%2214.758%20%3Ci%3E%24ANSEM%3C/i%3E%22%7D%2C%7B%22tag%22%3A%22BOUNTY%22%2C%22bounty%22%3Atrue%2C%22name%22%3A%22YUNG_TREE_STUMP%22%2C%22note%22%3A%22cleared%20Triple%20Top%3A%203%20bosses%2C%20one%20run%22%2C%22amount%22%3A%2214.758%20%3Ci%3E%24ANSEM%3C/i%3E%22%7D%5D%2C%22foot%22%3A%225%20transfers%20to%203%20players%20%C2%B7%20every%20run%20replayed%20on%20the%20server%20%C2%B7%20free%20to%20play%2C%20no%20coin%20needed%20to%20win%22%2C%22split%22%3A%5B%5B%2260%25%20%E2%86%92%20the%20top%20places%22%2C%2244.275%22%5D%2C%5B%2240%25%20%E2%86%92%20the%20bounty%22%2C%2229.516%22%5D%5D%7D',
        'content/x/img/60-daily-pot-day1.png',
        1600,
        900
    ],
    [
        'scripts/og/x/pipeline.html?state=running&n=4&date=25%20SEP',
        'content/x/img/35-build4-in-progress.png',
        1600,
        900
    ],
    [
        'scripts/og/x/pipeline.html?state=green&n=4&date=25%20SEP',
        'content/x/img/36-build4-all-green.png',
        1600,
        900
    ],
    [
        'scripts/og/x/pipeline.html?state=red&n=4&date=25%20SEP',
        'content/x/img/36-build4-gate-red.png',
        1600,
        900
    ],
    // Frames for videos assembled with ffmpeg (content/x/video/).
    ['scripts/og/x/video-end.html', 'content/x/video/src/daily-end.png', 1920, 1080],
    ['scripts/og/x/video-split.html', 'content/x/video/src/split-frame.png', 1920, 1080]
].filter(
    ([, out]) => !process.argv[2] || process.argv.slice(2).includes(path.basename(out, '.png'))
);
const browser = await launch('chromium');
for (const [src, out, w, h] of jobs) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}/${src}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => window.ready === true, null, { timeout: 10000 });
    await page.screenshot({ path: path.join(root, out) });
    if (errors.length) throw new Error(`${src}: ${errors.join('; ')}`);
    console.log('wrote', out);
    await page.close();
}
await browser.close();
server.close();
