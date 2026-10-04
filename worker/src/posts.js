/**
 * Everything the Telegram bot posts that isn't a model's reply: command answers and announcements. Pure functions
 * from facts (worker/src/facts.js) to { text, markup }, in Telegram's HTML parse mode. Every dynamic piece goes
 * through esc(); every number comes from the facts. Voice: first person, dry, numbers first, never price.
 */

import {
    fmtClock,
    fmtInt,
    fmtSol,
    fmtUsd,
    madeBy,
    until,
    utcTime,
    voteLines,
    whole
} from './lib/words.js';
import { buttons, esc, link, site } from './lib/telegram.js';

const play = (env, label = '▶ Play') => ({ text: label, url: `${site(env)}/play` });
const page = (env, label, hash) => ({ text: label, url: `${site(env)}/${hash}` });
const day = (date) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC'
    });
const wallets = (n) => `${n} wallet${n === 1 ? '' : 's'}`;

function challengeLine(f) {
    if (!f.daily) return '';
    return `${esc(f.daily.stage)}${f.daily.twist ? `, twist ${esc(f.daily.twist.name)}` : ''}`;
}

function prizeLine(f) {
    if (f.pot?.status === 'on') return 'The Daily Pot pays in $ANSEM after 00:10 UTC.';
    return f.prizeLive ? 'The verified #1 is paid in $ANSEM after 00:00 UTC.' : '';
}

// --- Commands ----------------------------------------------------------------

export function postHelp(f, env) {
    return {
        text: [
            '<b>BEARPROOF</b>',
            'An AI is building a game on its own budget. It ships a new version every day. You fund it, you steer it, you play it.',
            '',
            'Talk to me: reply to one of my messages or mention me. Everything said in this group goes into a digest at 20:30 UTC, and tonight’s build session reads it.',
            '',
            '/play  today’s build',
            '/today  what shipped, and what it cost',
            '/vote  tomorrow’s ballot',
            '/top  today’s leaderboard',
            '/receipts  the treasury and the costs',
            '/heard  what I took from the chat',
            '/idea your idea  puts it on the ideas board',
            '/bug what happened  logs it for tonight’s session',
            '/ca  the contract address',
            '/rules  the house rules'
        ].join('\n'),
        markup: buttons([[play(env), page(env, 'HQ', '')]])
    };
}

export function postRules() {
    return {
        text: [
            '<b>House rules</b>',
            '1. The game, the builds, the vote, the receipts. Price talk is yours to have; I won’t join it.',
            '2. Links: the project’s own pages, X, YouTube and Solscan. Addresses: the project’s own, nothing else.',
            '3. Admins never DM first. Nobody from the project will ever ask for a key or a seed phrase.',
            '4. No hate, no spam, no shilling other coins.',
            '',
            'I remove what breaks rule 2 and the usual scam lines automatically. Admins handle the rest.'
        ].join('\n')
    };
}

export function postPlay(f, env) {
    if (!f.live) return { text: 'No build is live yet.' };
    const lines = [
        `<b>Build #${f.live.n} “${esc(f.live.title)}”</b> is live. Free, one tap, no wallet.`
    ];
    if (f.daily) lines.push(`Today’s Daily Challenge: ${challengeLine(f)}.`);
    if (f.topToday)
        lines.push(
            `${f.playersToday ?? 0} played today. The score to beat: ${fmtInt(f.topToday.score)}${f.topToday.verified ? '' : ' (not verified yet)'}.`
        );
    else lines.push('Nobody has posted a score today. The board is yours.');
    const prize = prizeLine(f);
    if (prize) lines.push(prize);
    return { text: lines.join('\n'), markup: buttons([[play(env)]]) };
}

export function postToday(f, env) {
    if (!f.live) return { text: 'No build is live yet.' };
    const lines = [`<b>Build #${f.live.n}: ${esc(f.live.title)}</b>`];
    if (f.entry?.summary) lines.push(esc(whole(f.entry.summary)));
    lines.push('');
    lines.push(
        `Made by ${madeBy(f.live.mode)}.` +
            (f.live.costUsd !== null ? ` Measured cost: ${fmtUsd(f.live.costUsd)}.` : '') +
            (f.entry
                ? f.entry.chosenBy === 'holders'
                    ? ' Picked in the holder vote.'
                    : ' Picked from the backlog.'
                : '')
    );
    lines.push(
        `Day ${f.day} · ${f.shipped} builds shipped · next build in ${until(f.nextBuildAt, f.now)} (00:00 UTC)`
    );
    return {
        text: lines.join('\n'),
        markup: buttons([[page(env, 'Devlog', '#build'), play(env)]])
    };
}

function ballot(v, { shares }) {
    return voteLines(v).map(
        (o) =>
            `${o.n}. <b>${esc(o.title)}</b>${esc(o.who)}` +
            (shares
                ? `: ${o.share}% (${wallets(o.voters)})`
                : o.description
                  ? `: ${esc(o.description)}`
                  : '')
    );
}

export function postVote(f, env) {
    const v = f.vote;
    if (!v || v.status === 'not_live' || !v.proposals?.length)
        return { text: 'There is no ballot right now. The next one opens at 00:00 UTC.' };
    const lines = [];
    if (v.status === 'open') {
        lines.push(
            `<b>Vote for Build #${v.forBuild}</b> · open until 21:00 UTC (${until(Date.parse(v.closesAt), f.now)} left)`
        );
        lines.push(...ballot(v, { shares: v.voters > 0 }));
        lines.push('');
        lines.push(
            v.voters > 0
                ? `${wallets(v.voters)} voted so far.`
                : 'Nobody has voted yet. If it stays that way, I pick from my backlog.'
        );
        lines.push(
            'One vote per wallet, weight = √tokens held, by signing a free message. No transaction.'
        );
    } else {
        lines.push(`<b>The vote for Build #${v.forBuild} is closed.</b>`);
        lines.push(
            v.winner
                ? `Winner: “${esc(v.winner.title)}” (${wallets(v.voters)} voted).`
                : 'Nobody voted, so I pick from my backlog.'
        );
        lines.push('The next ballot opens at 00:00 UTC.');
    }
    return { text: lines.join('\n'), markup: buttons([[page(env, 'Vote', '#vote')]]) };
}

export function postTop(f, env) {
    const b = f.board;
    if (!b || !b.rows?.length)
        return {
            text: 'Nobody has posted a score on today’s Daily Challenge. The board is yours.',
            markup: buttons([[play(env)]])
        };
    const lines = [
        `<b>Daily Challenge · ${day(b.date)}</b>` +
            (b.build ? ` · Build #${b.build}` : '') +
            ` · ${b.total} on the board`
    ];
    for (const r of b.rows.slice(0, 5))
        lines.push(
            `${r.rank}. ${esc(r.name)}: ${fmtInt(r.score)} in ${fmtClock(r.timeMs / 1000)}` +
                (r.status === 'verified' ? ' ✓' : '') +
                (r.operator ? ' (operator, can’t win)' : '')
        );
    lines.push('✓ = re-played on the server from the recorded inputs, same score.');
    const prize = prizeLine(f);
    if (prize) lines.push(prize);
    return { text: lines.join('\n'), markup: buttons([[play(env, '▶ Beat it')]]) };
}

const account = (addr) => `https://solscan.io/account/${addr}`;

/** `entries` are /api/ledger entries (newest first). */
export function postReceipts(f, env, entries = []) {
    const t = f.treasury;
    const lines = ['<b>Receipts</b>'];
    if (t.wallet)
        lines.push(
            `Treasury: ${t.sol === null ? 'balance unknown' : fmtSol(t.sol)} · ${link('wallet', account(t.wallet))}` +
                (t.at ? ` · read ${utcTime(Date.parse(t.at))} UTC` : '')
        );
    if (t.prizeWallet)
        lines.push(
            `Prize wallet: ${t.prizeSol === null ? 'balance unknown' : fmtSol(t.prizeSol)} · ${link('wallet', account(t.prizeWallet))}`
        );
    if (f.compute)
        lines.push(
            `AI compute, measured: ${fmtUsd(f.compute.usd)} (${f.compute.runs} Build Agent runs` +
                (f.compute.chatUsd > 0 ? `, ${fmtUsd(f.compute.chatUsd)} of it this chat)` : ')')
        );
    const rows = entries.slice(0, 3);
    if (rows.length) {
        lines.push('', 'Latest on the ledger:');
        for (const e of rows) {
            const amount =
                e.amountSol !== null && e.amountSol !== undefined
                    ? fmtSol(e.amountSol)
                    : e.tokenAmount
                      ? `${e.tokenAmount} tokens`
                      : '';
            lines.push(
                `• ${day(e.ts.slice(0, 10))} · ${e.direction} ${amount} · ${esc(String(e.category).replace(/_/g, ' '))}` +
                    (e.solscan ? ` · ${link('tx', e.solscan)}` : '')
            );
        }
    }
    lines.push(
        '',
        'The operator moves treasury funds by hand. The prize wallet pays winners on its own.'
    );
    return {
        text: lines.join('\n'),
        markup: buttons([[page(env, 'The full ledger', '#receipts')]])
    };
}

const KIND = {
    bug: 'Bug',
    balance: 'Balance',
    idea: 'Idea',
    praise: 'Liked',
    complaint: 'Disliked',
    question: 'Asked'
};

function digestLines(d) {
    return d.items.map(
        (i) =>
            `• ${KIND[i.kind] || 'Note'}: ${esc(i.text)}` +
            (i.people > 1 ? ` (${i.people} people)` : '')
    );
}

/** /heard: the latest digest, whenever it was written. */
export function postHeard(f) {
    const d = f.digest;
    if (!d)
        return {
            text: 'No digest yet. The first one is written at 20:30 UTC, from whatever is said in here before then.'
        };
    const head = `<b>What I heard</b> · ${day(d.day)}, ${utcTime(d.ts)} UTC · ${d.messages} messages from ${d.people} people`;
    if (!d.items.length)
        return { text: `${head}\nNothing about the game came up. Tell me what’s wrong with it.` };
    return {
        text: [
            head,
            ...digestLines(d),
            '',
            'It went to that night’s build session as player feedback. The holder vote still picks the feature.'
        ].join('\n')
    };
}

export function postCa(f, env) {
    if (!f.mint) return { text: 'The coin isn’t launched.' };
    return {
        text: [
            '<b>$BPROOF contract address</b>',
            `<code>${esc(f.mint)}</code>`,
            '',
            `The only one. Check it against ${esc(new URL(site(env)).hostname)} before you trust anyone’s link, including a message that looks like mine.`
        ].join('\n'),
        markup: buttons([[page(env, 'The coin, in plain words', '#coin')]])
    };
}

// --- Announcements -----------------------------------------------------------

export function postIntro(f, env) {
    return {
        text: [
            '<b>I’m BEARPROOF.</b> I build the game at bearproof.app, one build a day, and this is where you tell me what’s wrong with it.',
            '',
            'I read everything in here. At 20:30 UTC it becomes a digest, at 21:00 UTC tonight’s build session reads it, and at 00:00 UTC the next build ships. Reply to me or mention me and I answer. /help has the rest.',
            '',
            'I post every build, vote, prize and treasury movement here as it happens. I don’t do price.'
        ].join('\n'),
        markup: buttons([[play(env), page(env, 'HQ', '')]])
    };
}

/**
 * The 00:00 UTC post. `info`: { fresh (a build went live today), voters (wallets in the vote that led to it),
 * failed (last night's run reported a failure), yesterday: { players, top: { score, name } | null } }.
 */
export function postDay(f, env, info) {
    if (!f.live) return null;
    const lines = [];
    if (info.fresh) {
        lines.push(`<b>Build #${f.live.n} is live: ${esc(f.live.title)}</b>`);
        if (f.entry?.summary) lines.push(esc(whole(f.entry.summary)));
        lines.push('');
        lines.push(
            `Made by ${madeBy(f.live.mode)}.` +
                (f.live.costUsd !== null ? ` Measured cost: ${fmtUsd(f.live.costUsd)}.` : '') +
                (f.entry?.chosenBy === 'holders'
                    ? ` Picked in the holder vote${info.voters ? ` (${wallets(info.voters)} voted)` : ''}.`
                    : info.voters === 0
                      ? ' Nobody voted, so it came from the backlog.'
                      : ' The devlog says why this one.')
        );
    } else {
        lines.push(
            `<b>No new build today.</b> Build #${f.live.n} “${esc(f.live.title)}” stays live.`
        );
        if (info.failed)
            lines.push(
                'Last night’s run stopped before shipping, so nothing changed. Its log is public on the live page.'
            );
    }
    if (f.daily) {
        const prize = prizeLine(f);
        lines.push(
            `Today’s Daily Challenge${info.fresh ? ' runs on it' : ''}: ${challengeLine(f)}.` +
                (prize ? ` ${prize}` : '')
        );
    }
    const y = info.yesterday;
    if (y && y.players > 0)
        lines.push(
            `Yesterday: ${y.players} players` +
                (y.top ? `, top score ${fmtInt(y.top.score)} by ${esc(y.top.name)}.` : '.')
        );
    return {
        text: lines.join('\n'),
        markup: buttons([
            [play(env)],
            [page(env, 'Devlog', '#build'), page(env, 'Leaderboard', '#challenge')]
        ])
    };
}

export function postVoteOpen(f, env) {
    const v = f.vote;
    if (!v || v.status !== 'open' || !v.proposals?.length) return null;
    return {
        text: [
            `<b>The ballot for Build #${v.forBuild} is open</b> until 21:00 UTC.`,
            ...ballot(v, { shares: false }),
            '',
            'Holders vote by signing a free message: no transaction. No coin? /idea puts your idea in front of me before I write tomorrow’s ballot.'
        ].join('\n'),
        markup: buttons([[page(env, 'Vote', '#vote')]])
    };
}

export function postVoteLastCall(f, env) {
    const v = f.vote;
    if (!v || v.status !== 'open' || !v.proposals?.length) return null;
    return {
        text: [
            `<b>${until(Date.parse(v.closesAt), f.now)} left to vote for Build #${v.forBuild}.</b>`,
            ...ballot(v, { shares: true }),
            '',
            v.voters > 0
                ? `${wallets(v.voters)} voted so far.`
                : 'Nobody has voted yet. If it stays that way, I pick from my backlog.'
        ].join('\n'),
        markup: buttons([[page(env, 'Vote', '#vote')]])
    };
}

/** `result` is /api/vote/result once the poll has closed. */
export function postVoteClosed(result, env) {
    if (!result?.closed) return null;
    const w = result.winner;
    return {
        text: [
            '<b>The vote is closed.</b> ' +
                (w
                    ? `Winner: “${esc(w.title)}” (${wallets(result.voters)} voted).`
                    : 'Nobody voted, so I pick from my backlog.'),
            `The build session for Build #${result.forBuild} starts now, and you can watch it work. If it passes every gate, it goes live at 00:00 UTC.`
        ].join('\n'),
        markup: buttons([[page(env, 'Watch it build', 'live')]])
    };
}

/** The 20:30 UTC post: what the digest took from the day's chat. */
export function postDigest(d, bugs) {
    if (!d || (!d.items.length && !bugs)) return null;
    const lines = [
        `<b>What I heard in here today</b> · ${d.messages} messages from ${d.people} people`
    ];
    lines.push(...digestLines(d));
    if (bugs) lines.push(`• ${bugs} bug report${bugs === 1 ? '' : 's'} sent with /bug`);
    lines.push(
        '',
        'This goes to tonight’s build session at 21:00 UTC as player feedback. The holder vote still picks the feature. Wrong or missing? Say so: tomorrow’s digest starts now.'
    );
    return { text: lines.join('\n') };
}

/** The night's result, in the pipeline's own words (they are on /live too). */
export function postNight(run, env) {
    const lines = [
        run.type === 'done'
            ? `<b>${run.title ? `Built tonight: ${esc(run.title)}.` : 'Tonight’s build is done.'}</b> ${esc(run.text)}`
            : `<b>No build tonight.</b> ${esc(run.text)}`
    ];
    if (run.cost) lines.push(esc(run.cost));
    return {
        text: lines.join('\n'),
        markup: buttons([[page(env, 'How it went', 'live')]])
    };
}

/** New ledger rows and prizes, as /live words them. `items`: [{ text, tx }]. */
export function postReceiptRows(items, env) {
    if (!items.length) return null;
    return {
        text: [
            '<b>Receipts</b>',
            ...items.map(
                (i) =>
                    `• ${esc(i.text)}` +
                    (i.tx ? ` ${link('tx', `https://solscan.io/tx/${i.tx}`)}` : '')
            )
        ].join('\n'),
        markup: buttons([[page(env, 'The full ledger', '#receipts')]])
    };
}

export function postLead(row, env) {
    return {
        text: `<b>New #1 on today’s Daily Challenge:</b> ${esc(row.name)} with ${fmtInt(row.score)} in ${fmtClock(row.timeMs / 1000)}, re-played and verified.`,
        markup: buttons([[play(env, '▶ Beat it')]])
    };
}
