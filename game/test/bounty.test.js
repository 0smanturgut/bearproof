// The AI's bounty (Build #5): game/bounty.json passes the server's checkBounty, and the game's own check, wording
// and menu agree with the Worker's (worker/src/lib/bounty.js), so the game never says "cleared" when the server
// won't pay, or the other way round.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    BOUNTY_TYPES as SERVER_TYPES,
    bountyText as serverText,
    checkBounty,
    clearsBounty as serverClears
} from '../../worker/src/lib/bounty.js';
import {
    BOUNTY_TYPES,
    bountyProgress,
    bountyText,
    clearsBounty,
    readBounty
} from '../src/bounty.js';
import { shareText } from '../src/share.js';
import { Simulation } from '../src/sim/sim.js';
import { createBot } from '../src/sim/bot.js';

const FILE = JSON.parse(
    fs.readFileSync(fileURLToPath(new globalThis.URL('../bounty.json', import.meta.url)), 'utf8')
);

/** A sim summary as the verifier's runStats hands it to clearsBounty (scripts/verify-runs.mjs). */
const statsOf = (s) => ({
    t: s.timeMs,
    lvl: s.level,
    k: s.kills,
    s: s.score,
    bk: s.bossKills || 0,
    won: !!s.won
});

const sum = (timeMs, level, kills, bossKills, won = false) => ({
    timeMs,
    level,
    kills,
    bossKills,
    won,
    score: 0
});

const SAMPLE_RUNS = [
    sum(0, 1, 0, 0),
    sum(299_999, 18, 700, 0),
    sum(300_000, 20, 900, 1),
    sum(510_400, 31, 2400, 1),
    sum(620_000, 34, 4200, 2),
    sum(655_000, 36, 5100, 3),
    sum(710_050, 39, 6000, 3),
    sum(760_000, 42, 7800, 4, true),
    sum(1_200_000, 55, 19_999, 3),
    sum(1_200_000, 60, 20_000, 5)
];

const SAMPLE_BOUNTIES = [
    FILE,
    { type: 'survive', seconds: 300, name: 'Five Minute Hold' },
    { type: 'survive', seconds: 1200, name: 'Full Session' },
    { type: 'level', level: 35, name: 'Level Up' },
    { type: 'kills', kills: 5000, name: 'Bear Cull' },
    { type: 'bosses', bosses: 1, name: 'Rug Lord Hunt' },
    { type: 'bosses', bosses: 5, name: 'All Of Them' },
    { type: 'win', name: 'Cycle Turner' }
];

test("bounty.json passes the server's checkBounty, and the game reads it the same way", () => {
    const c = checkBounty(FILE);
    assert.ok(c.ok, `rejected: ${c.why}`);
    assert.deepEqual(readBounty(FILE), c.bounty);
    assert.equal(bountyText(c.bounty), serverText(c.bounty));
});

test('the game has the same bounty menu as the Worker', () => {
    assert.deepEqual(BOUNTY_TYPES, SERVER_TYPES);
});

test("the game's check and wording match the server's on every type", () => {
    for (const raw of SAMPLE_BOUNTIES) {
        const b = checkBounty(raw).bounty;
        assert.ok(b, raw.name);
        assert.deepEqual(readBounty(raw), b);
        assert.equal(bountyText(b), serverText(b));
        for (const run of SAMPLE_RUNS)
            assert.equal(
                clearsBounty(b, run),
                serverClears(b, statsOf(run)),
                `${raw.name} on ${JSON.stringify(run)}`
            );
    }
});

test('the game rejects what the server rejects', () => {
    const bad = [
        null,
        [],
        { type: 'bosses', bosses: 0, name: 'Zero' },
        { type: 'bosses', bosses: 6, name: 'Too Many' },
        { type: 'survive', seconds: 299, name: 'Too Short' },
        { type: 'kills', kills: 500.5, name: 'Half Kill' },
        { type: 'level', level: 20, name: 'ab' },
        { type: 'level', level: 20, name: 'x'.repeat(33) },
        { type: 'loot', name: 'Unknown' },
        { type: 'toString', name: 'Prototype' }
    ];
    for (const raw of bad) {
        assert.equal(checkBounty(raw).ok, false, JSON.stringify(raw));
        assert.equal(readBounty(raw), null, JSON.stringify(raw));
    }
});

test("real simulated runs: the game's verdict equals the server's", () => {
    const b = readBounty(FILE);
    for (const seed of [11, 22, 33]) {
        const sim = new Simulation({ seed });
        const bot = createBot({ phase: seed });
        while (!sim.over && sim.time < 360) {
            if (sim.choices) sim.choose(bot.pick(sim));
            else sim.step(bot.move(sim));
        }
        const s = sim.summary();
        assert.equal(clearsBounty(b, s), serverClears(b, statsOf(s)), `seed ${seed}`);
        // And the same run with its boss count pushed to the bar and past it.
        for (const bk of [b.bosses - 1, b.bosses, b.bosses + 1]) {
            const t = { ...s, bossKills: bk };
            assert.equal(clearsBounty(b, t), serverClears(b, statsOf(t)), `seed ${seed}, ${bk}`);
        }
    }
});

test('HUD progress counts toward the bar and says when it clears', () => {
    const b = { type: 'bosses', bosses: 3, name: 'Triple Top' };
    assert.deepEqual(bountyProgress(b, sum(0, 1, 0, 0)), {
        done: false,
        text: 'BOUNTY 0/3 BOSSES'
    });
    assert.equal(bountyProgress(b, sum(0, 1, 0, 2)).text, 'BOUNTY 2/3 BOSSES');
    assert.deepEqual(bountyProgress(b, sum(0, 1, 0, 3)), { done: true, text: 'BOUNTY CLEARED' });
    const s = { type: 'survive', seconds: 600, name: 'Ten' };
    assert.equal(bountyProgress(s, sum(65_000, 1, 0, 0)).text, 'BOUNTY 01:05/10:00');
});

test('a cleared Daily run adds one line to the share text; free runs never do', () => {
    const summary = { score: 10, kills: 1, level: 1, timeMs: 1000, won: false };
    const base = { summary, date: '2026-09-27', build: 5, origin: 'https://x.test' };
    const daily = shareText({ ...base, mode: 'daily', bounty: 'Triple Top' }).text;
    assert.match(daily, /\nCleared the AI's bounty: Triple Top\n/);
    assert.doesNotMatch(shareText({ ...base, mode: 'daily' }).text, /bounty/);
    assert.doesNotMatch(shareText({ ...base, mode: 'free', bounty: 'Triple Top' }).text, /bounty/);
});
