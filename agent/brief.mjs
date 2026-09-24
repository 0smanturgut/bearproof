#!/usr/bin/env node
/**
 * Post the start of a Build Agent run to /live: which build, what the vote chose, what yesterday's players did.
 * Reads $AGENT_CONTEXT (agent/context.mjs). A holder's request title is shown as text, like on the ballot.
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
events.push({
    type: 'context',
    text: w
        ? `Vote winner: "${w.title}" with ${w.share}% (${w.source === 'community' ? `a holder's request, ${w.requestedBy}` : 'my proposal'}).`
        : 'Nobody voted, so I pick from my own backlog.',
    data: w ? { winner: w.id, share: w.share, source: w.source } : null
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
await send(events);
