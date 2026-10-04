/**
 * The Telegram bot's words about live data (pure, unit-tested): number formats, the ballot as lines, and the
 * FACTS block the chat model answers from. The data itself is gathered in worker/src/facts.js.
 */

export const fmtInt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
export const fmtClock = (sec) =>
    `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
export const fmtUsd = (n) => `$${(Number(n) || 0).toFixed(2)}`;
export const fmtSol = (n) => `${(Number(n) || 0).toFixed(3)} SOL`;
export const utcTime = (ms) => new Date(ms).toISOString().slice(11, 16);

/**
 * A devlog summary without a sentence cut in half: the compiled summary stops at 280 characters with "…", so a
 * post keeps only the sentences that finished.
 */
export function whole(summary) {
    const s = String(summary || '').trim();
    if (!s.endsWith('…')) return s;
    const end = Math.max(s.lastIndexOf('. '), s.lastIndexOf('! '), s.lastIndexOf('? '));
    return end > 40 ? s.slice(0, end + 1) : s;
}

/**
 * The devlog's "## Heard in the chat" section as one plain paragraph (what the Build Agent says it did with the
 * Telegram group's feedback), or null when the devlog has none. Clipped to finished sentences.
 */
export function heardInChat(body) {
    const m = /^##\s+Heard in the chat[ \t]*\n+([\s\S]*?)(?=\n##\s|$(?![\s\S]))/m.exec(
        String(body || '')
    );
    if (!m) return null;
    const text = m[1]
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) return null;
    return text.length > 320 ? whole(`${text.slice(0, 320).replace(/\s+\S*$/, '')}…`) : text;
}

/** "3h 12m" until `ms`. */
export function until(ms, now) {
    const min = Math.max(0, Math.round((ms - now) / 60000));
    return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;
}

const MODES = {
    agent: 'the Build Agent, on its own, at night',
    bootstrap: 'the same AI in a session the operator started',
    human: 'Osman, by hand'
};

/** Who made a build, in words that match the devlog's `mode`. */
export function madeBy(mode) {
    return MODES[mode] || 'unknown';
}

/** The vote in one line per option, for people and for the model. */
export function voteLines(vote) {
    return (vote?.proposals || []).map((p, i) => {
        const who =
            p.source === 'community'
                ? ` (a holder's request, ${p.requestedBy})`
                : p.source === 'operator'
                  ? ' (put on the ballot by the operator)'
                  : p.from === 'player'
                    ? " (from a player's idea)"
                    : '';
        return {
            n: i + 1,
            title: p.title,
            description: p.description || '',
            who,
            share: p.share,
            voters: p.voters
        };
    });
}

/**
 * The FACTS block: everything the chat model may state as fact. Plain lines, each one read from the project's
 * own data a moment ago. What isn't here, the model must say it doesn't know.
 */
export function factsText(f) {
    const L = [];
    const add = (s) => s && L.push(`- ${s}`);
    add(
        `Now: ${new Date(f.now).toISOString().slice(0, 16).replace('T', ' ')} UTC. Day ${f.day ?? '?'} of building. Builds shipped: ${f.shipped}.`
    );
    add(`You are answering as the model ${f.model}.`);
    if (f.live) {
        add(
            `Live build: #${f.live.n} "${f.live.title}", live since ${f.live.activatesAt.slice(0, 10)} 00:00 UTC, made by ${madeBy(f.live.mode)}` +
                (f.live.costUsd !== null ? `; measured cost ${fmtUsd(f.live.costUsd)}.` : '.')
        );
        if (f.entry?.summary) add(`What it shipped (devlog): ${f.entry.summary}`);
        if (f.entry)
            add(
                f.entry.chosenBy === 'holders'
                    ? 'That feature was picked in the holder vote.'
                    : 'That feature was picked by the Build Agent from its backlog.'
            );
    } else add('No build is live.');
    add(`The next build goes live at 00:00 UTC, in ${until(f.nextBuildAt, f.now)}.`);
    if (f.game)
        add(
            `In the live build: weapons: ${f.game.weapons}. Passives: ${f.game.passives}. Enemies: ${f.game.enemies}. Bosses: ${f.game.bosses}. Characters: ${f.game.characters}.`
        );
    if (f.daily)
        add(
            `Today's Daily Challenge (same seed for everyone, on Build #${f.daily.build}): stage ${f.daily.stage}` +
                (f.daily.twist
                    ? `, twist ${f.daily.twist.name}: ${String(f.daily.twist.description).replace(/\.$/, '')}`
                    : '') +
                '.'
        );
    add(
        `Players today (unique browsers, UTC day): ${f.playersToday ?? 'unknown'}. Top score today: ${
            f.topToday
                ? `${fmtInt(f.topToday.score)} (${f.topToday.verified ? 'verified' : 'not verified yet'})`
                : 'none yet'
        }.`
    );
    const r = f.runs24;
    if (r && r.runs > 0)
        add(
            `Verified runs on the live build, last 24 h: ${r.runs} by ${r.players} players; median run ${fmtClock(r.survivalSec.median)}, best ${fmtClock(r.survivalSec.best)}` +
                (r.diedTo?.[0]
                    ? `; most deaths: ${r.diedTo[0].id.replace(/_/g, ' ')} (${r.diedTo[0].share}%).`
                    : '.')
        );
    else add('Verified runs on the live build, last 24 h: none yet.');
    if (f.vote) {
        const v = f.vote;
        const state =
            v.status === 'open'
                ? `open until 21:00 UTC (${until(Date.parse(v.closesAt), f.now)} left)`
                : v.status === 'closed'
                  ? 'closed for today; the next one opens at 00:00 UTC'
                  : 'not live';
        add(
            `Holder vote for Build #${v.forBuild}: ${state}. Wallets that voted: ${v.voters}. Rule: one vote per wallet, weight = floor(sqrt(tokens held)), at least ${fmtInt(v.rule?.minTokens)} tokens, by signing a free message on bearproof.app (no transaction).`
        );
        for (const o of voteLines(v))
            add(
                `Option ${o.n}: "${o.title}"${o.who}: ${o.description} [${o.share}% of the weight, ${o.voters} wallet${o.voters === 1 ? '' : 's'}]`
            );
        if (v.winner) add(`Winner of today's vote: "${v.winner.title}".`);
    }
    if (f.pot?.status === 'on')
        add(
            `Daily prize (the Daily Pot): ${f.pot.rule?.text || ''} Today's pot so far: ${f.pot.potSol} SOL (${f.pot.measured ? 'measured on-chain' : 'not measured yet'}).` +
                (f.pot.bounty ? ` Today's bounty: ${f.pot.bounty.name}: ${f.pot.bounty.text}.` : '')
        );
    else
        add(
            f.prizeLive
                ? 'Daily prize: the verified #1 with a payout address is paid in $ANSEM after 00:00 UTC.'
                : 'Daily prize: not live right now.'
        );
    add(
        'To win: play the Daily Challenge, and on the game-over screen type a Solana address (no wallet connection). Holding the coin is never required to play or win.'
    );
    const t = f.treasury;
    if (t.wallet)
        add(
            `Treasury wallet ${t.wallet}: ${t.sol === null ? 'balance unknown' : fmtSol(t.sol)}` +
                (t.at ? ` (read ${t.at.slice(0, 16).replace('T', ' ')} UTC)` : '') +
                (t.prizeWallet
                    ? `. Prize wallet ${t.prizeWallet}: ${t.prizeSol === null ? 'balance unknown' : fmtSol(t.prizeSol)}.`
                    : '.')
        );
    if (f.compute)
        add(
            `AI compute measured so far: ${fmtUsd(f.compute.usd)} in total: ${f.compute.runs} Build Agent runs` +
                (f.compute.chatUsd > 0
                    ? `, and ${fmtUsd(f.compute.chatUsd)} of it for this chat.`
                    : '.')
        );
    if (f.mint)
        add(
            `The coin: $BPROOF on Solana, contract address ${f.mint}. Prizes are paid in $ANSEM (${f.ansemMint}).`
        );
    if (f.digest)
        add(
            `Latest chat digest (${f.digest.day}, ${f.digest.messages} messages from ${f.digest.people} people): ` +
                (f.digest.items.length
                    ? f.digest.items.map((i) => `[${i.kind}] ${i.text}`).join(' | ')
                    : 'nothing about the game came up.')
        );
    else add('No chat digest has been written yet; the first one is written at 20:30 UTC.');
    add(
        'Pages: bearproof.app (the HQ: builds, vote, ideas, leaderboard, receipts, FAQ), bearproof.app/play (the game), bearproof.app/live (the Build Agent at work).'
    );
    return L.join('\n');
}
