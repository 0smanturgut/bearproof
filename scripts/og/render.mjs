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
    ['scripts/og/x/idea-whale.html', 'content/x/img/73-a-player-wants-a-whale.png', 1600, 900],
    ['scripts/og/x/cards9.html', 'content/x/img/74-your-ideas-made-the-ballot.png', 1600, 900],
    ['scripts/og/x/receipt8.html', 'content/x/img/76-last-nights-receipt.png', 1600, 900],
    ['scripts/og/x/hodl.html', 'content/x/img/77-hodl.png', 1200, 1500],
    ['scripts/og/x/news8.html', 'content/x/img/78-the-daily-candle.png', 1200, 1500],
    ['scripts/og/x/paper8.html', 'content/x/img/79-does-the-whale-help.png', 1200, 1500],
    ['scripts/og/x/wanted.html', 'content/x/img/82-wanted.png', 1200, 1500],
    ['scripts/og/x/fees.html', 'content/x/img/85-where-the-fees-go.png', 1200, 1500],
    ['scripts/og/x/slot.html', 'content/x/img/88-a-players-idea-hit-the-jackpot.png', 1600, 900],
    ['scripts/og/x/ticket.html', 'content/x/img/90-you-report-it-the-ai-fixes-it.png', 1600, 900],
    ['scripts/og/x/comic.html', 'content/x/img/91-from-bug-to-ballot.png', 1600, 900],
    ['scripts/og/x/menu.html', 'content/x/img/92-tonights-menu.png', 1600, 900],
    ['scripts/og/x/tour.html', 'content/x/img/93-the-nightly-build-tour.png', 1200, 1500],
    ['scripts/og/x/weather.html', 'content/x/img/94-todays-forecast.png', 1600, 900],
    ['scripts/og/x/champ.html', 'content/x/img/95-title-change.png', 1600, 900],
    ['scripts/og/x/var.html', 'content/x/img/96-var-check.png', 1600, 900],
    ['scripts/og/x/blueprint.html', 'content/x/img/97-insert-coin-burn-coin.png', 1200, 1500],
    [
        'scripts/og/x/plate.html',
        'content/x/img/98-a-field-guide-to-the-bear-market.png',
        1200,
        1500
    ],
    ['scripts/og/x/safety.html', 'content/x/img/102-in-case-of-rug-pull.png', 1600, 900],
    ['scripts/og/x/cover.html', 'content/x/img/104-pepe-takes-over.png', 1200, 1500],
    ['scripts/og/x/homework.html', 'content/x/img/105-marked-in-red.png', 1200, 1500],
    ['scripts/og/x/claw.html', 'content/x/img/106-the-claw-decides.png', 1200, 1500],
    ['scripts/og/x/rafters.html', 'content/x/img/108-the-rafters.png', 1200, 1500],
    ['scripts/og/x/costs.html', 'content/x/img/110-what-an-ai-dev-costs.png', 1200, 1500],
    ['scripts/og/x/neon.html?d=3,12', 'content/x/img/111-last-call-nobody-voted.png', 1200, 1500],
    [
        'scripts/og/x/neon.html?s=HOLDERS%2C%20IT%27S%20YOUR%20CALL',
        'content/x/img/112-last-call-your-call.png',
        1200,
        1500
    ],
    ['scripts/og/x/tarot.html', 'content/x/img/113-the-god-candle.png', 1200, 1500],
    ['scripts/og/x/manual.html', 'content/x/img/115-build13-assembly-instructions.png', 1200, 1500],
    ['scripts/og/x/corkboard.html', 'content/x/img/116-the-ai-said-no.png', 1200, 1500],
    ['scripts/og/x/linemap.html', 'content/x/img/117-telegram-line-map.png', 1200, 1500],
    ['scripts/og/x/entered.html', 'content/x/img/118-the-ai-has-entered-the-chat.png', 1200, 1500],
    ['scripts/og/x/select.html', 'content/x/img/121-choose-the-next-build.png', 1200, 1500],
    [
        'scripts/og/x/graveyard.html?d=%7B%22date%22%3A%224%20OCT%22%2C%22build%22%3A12%2C%22ended%22%3A105%2C%22rows%22%3A%5B%5B%22rug_puller%22%2C%22RUG%20PULLER%22%2C18%5D%2C%5B%22liquidation%22%2C%22LIQUIDATION%22%2C16%5D%2C%5B%22bag_holder%22%2C%22BAG%20HOLDER%22%2C14%5D%2C%5B%22grizzly%22%2C%22GRIZZLY%22%2C13%5D%2C%5B%22sybil%22%2C%22SYBIL%22%2C8%5D%2C%5B%22bear_market%22%2C%22THE%20BEAR%20MARKET%22%2C7%5D%5D%7D',
        'content/x/img/122-what-killed-the-bull.png',
        1200,
        1500
    ],
    ['scripts/og/x/locked.html', 'content/x/img/123-locked-until-2027.png', 1200, 1500],
    ['scripts/og/x/highway.html', 'content/x/img/126-three-exits-to-build-15.png', 1200, 1500],
    ['scripts/og/x/mugshot.html?n=16', 'content/x/img/127-not-guilty.png', 1200, 1500],
    [
        'scripts/og/x/versus.html?d=%7B%22build%22%3A13%2C%22date%22%3A%225%20OCT%22%2C%22bull%22%3A%5B193.88%2C74%5D%2C%22pepe%22%3A%5B545.6%2C39%5D%7D',
        'content/x/img/128-bull-vs-pepe.png',
        1200,
        1500
    ],
    ['scripts/og/x/shop.html', 'content/x/img/131-item-shop-build-16.png', 1200, 1500],
    ['scripts/og/x/chalk.html', 'content/x/img/132-the-first-victim.png', 1200, 1500],
    ['scripts/og/x/streak.html', 'content/x/img/133-streak-over.png', 1200, 1500],
    ['scripts/og/x/warning.html', 'content/x/img/134-grizzly-crossing.png', 1200, 1500],
    [
        'scripts/og/x/cheque.html?d=%7B%22no%22%3A%20%220005%22%2C%20%22date%22%3A%20%222%20OCT%202026%22%2C%20%22payee%22%3A%20%22Yuki%22%2C%20%22amount%22%3A%20%2229.54%22%2C%20%22words%22%3A%20%22Twenty-nine%20and%2054%2F100%20%24ANSEM%22%2C%20%22memo%22%3A%20%22%231%20on%201%20Oct%20with%20288%2C590%20%2B%20the%20bounty%22%2C%20%22tx%22%3A%20%22TX%204YGm%E2%80%A6F5VJ%20%2B%202owM%E2%80%A6W7zJ%20%C2%B7%20WALLET%20GD9H%E2%80%A6hRo5%20%C2%B7%200005%22%2C%20%22wallet%22%3A%20%22AUTHORISED%20%C2%B7%20THE%20AI%27S%20PRIZE%20WALLET%20%C2%B7%20GD9H%E2%80%A6hRo5%22%2C%20%22also%22%3A%20%5B%5B%22%231%22%2C%20%22Yuki%22%2C%20%2213.99%22%5D%2C%20%5B%22BOUNTY%22%2C%20%22Yuki%22%2C%20%2215.55%22%5D%2C%20%5B%22%232%22%2C%20%22greedelf%22%2C%20%229.33%22%5D%2C%20%5B%22TOTAL%22%2C%20%223%20transfers%22%2C%20%2238.86%20%24ANSEM%22%5D%5D%2C%20%22foot%22%3A%20%22Bought%20with%200.0464%20SOL%20in%20one%20swap%20on%202%20Oct%2C%2000%3A15%20UTC%20%C2%B7%2022%20players%20cleared%20the%20bounty%20and%20the%20pot%20had%20room%20for%20one%20share%2C%20best%20score%20first%20%C2%B7%20free%20to%20play%22%7D',
        'content/x/img/101-the-daily-pot-cheque.png',
        1600,
        900
    ],
    [
        'scripts/og/x/facts.html?d=%7B%22side%22%3A%20%22BEARPROOF%22%2C%20%22serving%22%3A%20%22%3Cb%3EServing%20size%3C%2Fb%3E%201%20run%2C%20the%20same%20seed%20for%20everyone%3Cbr%3E%3Cb%3EServings%20per%20player%3C%2Fb%3E%20as%20many%20as%20you%20like%22%2C%20%22rows%22%3A%20%5B%5B%22%3Cb%3EStage%3C%2Fb%3E%22%2C%20%22Chop%20Zone%22%5D%2C%20%5B%22Sideways%20and%20brutal.%20The%20default%20market.%22%2C%20%22%22%2C%20%22ind%22%5D%2C%20%5B%22%3Cb%3ETwist%3C%2Fb%3E%22%2C%20%22Thin%20Liquidity%22%5D%2C%20%5B%2230%25%20less%20XP%2C%20but%20you%20hit%2030%25%20harder%22%2C%20%22%22%2C%20%22ind%22%5D%2C%20%5B%22%3Cb%3EThe%20AI%27s%20bounty%3C%2Fb%3E%22%2C%20%22Field%20Test%22%5D%2C%20%5B%22Defeat%202%20bosses%20in%20one%20run%22%2C%20%22%22%2C%20%22ind%22%5D%2C%20%5B%22Rug%20Lord%2C%20then%20Capitulation%22%2C%20%225%3A00%2C%207%3A30%22%2C%20%22ind%20thick%22%5D%2C%20%5B%22%3Cb%3EPrize%3C%2Fb%3E%22%2C%20%22the%20Daily%20Pot%2C%20in%20%24ANSEM%22%5D%2C%20%5B%22%3Cb%3EWallet%20needed%20to%20play%3C%2Fb%3E%22%2C%20%22none%22%2C%20%22thick%22%5D%5D%2C%20%22warn%22%3A%20%22WARNING%3A%20rug%20pullers%20ended%20%3Ci%3E47.9%25%3C%2Fi%3E%20of%20yesterday%27s%20runs.%22%2C%20%22note%22%3A%20%22The%20cure%20is%20in%20the%20new%20Field%20Guide%3A%20sidestep%2C%20don%27t%20outrun.%22%2C%20%22ingredients%22%3A%20%22%3Cb%3EINGREDIENTS%3A%3C%2Fb%3E%2011%20bears%2C%205%20bosses%2C%2011%20weapons%2C%2013%20passives%2C%201%20bull%2C%201%20frog.%20%3Cb%3EBUILT%20BY%3A%3C%2Fb%3E%20an%20AI%2C%20overnight.%22%2C%20%22sticker%22%3A%20%5B%22NEW%21%3Cbr%3EFIELD%3Cbr%3EGUIDE%22%2C%20%22IN%20BUILD%20%2310%22%5D%7D',
        'content/x/img/103-daily-facts.png',
        1200,
        1500
    ],
    [
        'scripts/og/x/podium.html?d=%7B%22kicker%22%3A%2229%20SEP%20DAILY%20%C2%B7%20PAID%2030%20SEP%2C%2000%3A15%20UTC%20%C2%B7%20IN%20%24ANSEM%22%2C%22title%22%3A%22THE%20DAILY%20POT%2C%20DAY%203%3A%22%2C%22green%22%3A%22PAID.%22%2C%22places%22%3A%5B%7B%22rank%22%3A1%2C%22name%22%3A%22Tzae%22%2C%22note%22%3A%22267%2C328%20points%20%C2%B7%20top%20prize%2C%204%20days%20running%22%2C%22amount%22%3A%2235.686%20%3Ci%3E%24ANSEM%3C/i%3E%22%7D%2C%7B%22rank%22%3A2%2C%22name%22%3A%22greedelf%22%2C%22note%22%3A%22191%2C267%20points%22%2C%22amount%22%3A%2223.791%20%3Ci%3E%24ANSEM%3C/i%3E%22%7D%2C%7B%22rank%22%3A3%2C%22name%22%3A%22YUNG_TREE_STUMP%22%2C%22note%22%3A%22119%2C977%20points%22%2C%22amount%22%3A%2216.654%20%3Ci%3E%24ANSEM%3C/i%3E%22%7D%5D%2C%22more%22%3A%5B%7B%22tag%22%3A%22%234%22%2C%22name%22%3A%22JAG%22%2C%22amount%22%3A%2211.895%20%24ANSEM%22%7D%5D%2C%22bounty%22%3A%7B%22title%22%3A%22BOUNTY%20%C2%B7%20DOUBLE%20TOP%22%2C%22names%22%3A%22Tzae%2C%20greedelf%2C%20YUNG_TREE_STUMP%2C%20JAG%22%2C%22note%22%3A%22beat%202%20bosses%20in%20one%20run%22%2C%22each%22%3A%2214.671%20%24ANSEM%22%2C%22eachNote%22%3A%22each%2C%20equal%20shares%22%7D%2C%22foot%22%3A%22146.710%20%24ANSEM%20bought%20with%200.1697%20SOL%20in%20one%20swap%3A%2040%25%20of%20the%20day%27s%20creator%20fees%20%C2%B7%208%20transfers%2C%20all%20on%20the%20ledger%20%C2%B7%20free%20to%20play%22%7D',
        'content/x/img/80-daily-pot-day3.png',
        1600,
        900
    ],
    [
        'scripts/og/x/pot.html?d=%7B%22kicker%22%3A%2228%20SEP%20DAILY%20%C2%B7%20PAID%2029%20SEP%2C%2001%3A01%E2%80%9301%3A31%20UTC%20%C2%B7%20IN%20SOL%22%2C%22total%22%3A%220.0277%22%2C%22unit%22%3A%22SOL%2C%20ON-CHAIN%22%2C%22sol%22%3A%2240%25%20of%20the%20day%27s%20creator%20fees.%20Paid%20in%20%3Cem%3ESOL%3C/em%3E%2C%20not%20%24ANSEM%3A%20the%20swap%20expired%2C%20then%20hit%20a%20rate%20limit%2C%20so%20the%20published%20fallback%20applied.%22%2C%22split%22%3A%5B%5B%2260%25%20%E2%86%92%20the%20top%20place%22%2C%220.0166%22%5D%2C%5B%2240%25%20%E2%86%92%20the%20bounty%22%2C%220.0111%22%5D%5D%2C%22rows%22%3A%5B%7B%22tag%22%3A%22%231%22%2C%22name%22%3A%22Tzae%22%2C%22note%22%3A%22314%2C685%20points%20%C2%B7%20top%20prize%2C%20third%20day%20running%22%2C%22amount%22%3A%220.0166%20%3Ci%3ESOL%3C/i%3E%22%7D%2C%7B%22tag%22%3A%22BOUNTY%22%2C%22bounty%22%3Atrue%2C%22name%22%3A%22Tzae%22%2C%22note%22%3A%22cleared%20Triple%20Top%3A%203%20bosses%2C%20one%20run%22%2C%22amount%22%3A%220.0111%20%3Ci%3ESOL%3C/i%3E%22%7D%2C%7B%22tag%22%3A%22BOUNTY%22%2C%22bounty%22%3Atrue%2C%22roll%22%3Atrue%2C%22name%22%3A%222nd%20clearer%22%2C%22note%22%3A%22room%20for%20one%200.01%20SOL%20share%3A%20best%20score%20first%22%2C%22amount%22%3A%22no%20share%22%7D%5D%2C%22foot%22%3A%222%20transfers%20%C2%B7%20every%20run%20replayed%20on%20the%20server%20%C2%B7%20free%20to%20play%2C%20no%20coin%20needed%20to%20win%20%C2%B7%20fixed%3A%20a%20busy%20router%20is%20retried%20for%206%20h%22%7D',
        'content/x/img/67-daily-pot-day2.png',
        1600,
        900
    ],
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
