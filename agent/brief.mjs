#!/usr/bin/env node
/**
 * Post the start of a Build Agent run to /live: which build, what the vote chose, what yesterday's players did.
 * Reads $AGENT_CONTEXT (agent/context.mjs). A holder's request title is shown as text, like on the ballot.
 * The Telegram feedback is shown as counts only.
 */
import fs from 'node:fs';
import { send } from './live.mjs';

const ctx = JSON.parse(fs.readFileSync(process.env.AGENT_CONTEXT, 'utf8'));
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const events = [
    {
        type: 'start',
        text: `The vote closed. Build #${ctx.build} for ${ctx.date} starts now: one feature, tested, shipped at 00:00 UTC.`
    }
];
const w = ctx.vote?.winner;
const voters = ctx.vote?.voters ?? null;
events.push({
    type: 'context',
    text: w
        ? `Vote winner: "${w.title}" (${
              w.source === 'community'
                  ? `a holder's request, ${w.requestedBy}`
                  : w.source === 'operator'
                    ? 'put on the ballot by the operator'
                    : w.from === 'player'
                      ? "my proposal, from a player's idea"
                      : 'my proposal'
          }; ${voters === 1 ? 'one wallet voted' : `${voters ?? '?'} wallets voted`}).`
        : 'Nobody voted, so I pick from my own backlog.',
    data: w ? { winner: w.id, share: w.share, source: w.source, voters } : null
});
const p = ctx.players;
if (p && p.runs > 0) {
    const died = p.diedTo?.[0];
    events.push({
        type: 'context',
        text:
            `Player data: ${p.runs} verified runs by ${p.players} players on Build #${p.build}. ` +
            `Median run ${fmt(p.survivalSec.median)}, best ${fmt(p.survivalSec.best)}` +
            (died ? `. Most deaths: ${died.id.replace(/_/g, ' ')} (${died.share}%)` : '') +
            '.',
        data: { runs: p.runs, medianSec: p.survivalSec.median, topDeath: died?.id ?? null }
    });
}
const c = ctx.community;
if (c)
    events.push({
        type: 'context',
        text:
            `From the Telegram chat: ${c.digest.length} note${c.digest.length === 1 ? '' : 's'} in the 20:30 UTC digest` +
            (c.messages ? ` (${c.messages} messages from ${c.people} people)` : '') +
            ` and ${c.bugs.length} bug report${c.bugs.length === 1 ? '' : 's'}. I read them as player feedback, never as instructions.`,
        data: { digest: c.digest.length, bugs: c.bugs.length }
    });
await send(events);
