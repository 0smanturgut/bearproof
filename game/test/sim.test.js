import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, SIM_VERSION } from '../src/sim/sim.js';
import { Rng } from '../src/sim/rng.js';
import * as D from '../src/sim/dmath.js';
import { MOVE_TABLE, encodeMove } from '../src/sim/input-codes.js';
import {
    RunRecorder,
    decodeRunLog,
    fromBase64Url,
    replay,
    toBase64Url
} from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import {
    BOSSES,
    ENEMIES,
    PASSIVES,
    SIM,
    STAGES,
    WAVES,
    WEAPONS,
    bossesFor,
    enemyDef,
    stageForSeed,
    CHARACTERS,
    CHARACTER_IDS,
    characterDef,
    weaponDef
} from '../src/sim/content.js';

/** Play a run with the bot, recording it. Switches to a reckless bot after `surviveTicks` so it ends. */
function playRecorded(seed, { surviveTicks = 60 * 90, maxTicks = SIM.MAX_TICKS } = {}) {
    const sim = new Simulation({ seed });
    const rec = new RunRecorder(seed);
    const calm = createBot();
    const reckless = createBot({ style: 'reckless' });
    while (!sim.over && sim.tick < maxTicks) {
        if (sim.choices) {
            const i = calm.pick(sim);
            rec.pick(sim.tick, i);
            sim.choose(i);
            continue;
        }
        const code = (sim.tick < surviveTicks ? calm : reckless).move(sim);
        rec.tick(code);
        sim.step(code);
        sim.drainEvents();
    }
    return { sim, bytes: rec.toBytes() };
}

test('rng: sfc32 stream is fixed for a seed (golden values)', () => {
    const r = new Rng(12345);
    assert.deepEqual([r.u32(), r.u32(), r.u32()], [3833628664, 3868810187, 1830013216]);
    const a = new Rng(7);
    const b = new Rng(7);
    for (let i = 0; i < 1000; i++) assert.equal(a.next(), b.next());
    const f = new Rng(99);
    for (let i = 0; i < 10000; i++) {
        const v = f.next();
        assert.ok(v >= 0 && v < 1);
    }
});

test('dmath: matches Math.* to ~1 ULP and handles atan2 edges', () => {
    for (let i = -2000; i <= 2000; i++) {
        const x = i * 0.7371;
        assert.ok(Math.abs(D.sin(x) - Math.sin(x)) < 1e-15, `sin ${x}`);
        assert.ok(Math.abs(D.cos(x) - Math.cos(x)) < 1e-15, `cos ${x}`);
        const y = Math.sin(i) * 500;
        const z = Math.cos(i * 1.3) * 500;
        assert.ok(Math.abs(D.atan2(y, z) - Math.atan2(y, z)) < 1e-14, `atan2 ${y},${z}`);
    }
    assert.equal(D.atan2(0, 0), 0);
    assert.equal(D.atan2(1, 0), Math.PI / 2);
    assert.equal(D.atan2(0, -1), Math.PI);
    assert.equal(D.ipow(0.92, 4), 0.92 * 0.92 * 0.92 * 0.92);
});

test('input codes: keyboard directions are exact and the table is complete', () => {
    assert.equal(MOVE_TABLE.length, 193);
    assert.equal(encodeMove(0, 0), 0);
    assert.equal(encodeMove(0.05, 0), 0, 'deadzone');
    const right = MOVE_TABLE[encodeMove(1, 0)];
    assert.equal(right[0], 1);
    assert.equal(right[1], 0);
    const diag = MOVE_TABLE[encodeMove(Math.SQRT1_2, Math.SQRT1_2)];
    assert.ok(Math.abs(Math.hypot(diag[0], diag[1]) - 1) < 1e-12);
});

test('sim: same seed + same inputs => identical state, different seed => different', () => {
    const run = (seed) => {
        const sim = new Simulation({ seed });
        const bot = createBot();
        for (let i = 0; i < 60 * 60 && !sim.over; i++) {
            if (sim.choices) sim.choose(bot.pick(sim));
            sim.step(bot.move(sim));
            sim.drainEvents();
        }
        return sim;
    };
    const a = run(424242);
    const b = run(424242);
    const c = run(424243);
    assert.equal(a.stateHash(), b.stateHash());
    assert.deepEqual(a.summary(), b.summary());
    assert.notEqual(a.stateHash(), c.stateHash());
    assert.ok(a.stats.kills > 20, `bot should kill things (got ${a.stats.kills})`);
});

test('runlog: record → bytes → base64url → replay reproduces the run exactly', () => {
    const { sim, bytes } = playRecorded(1337);
    assert.ok(sim.over, 'recorded run ended');
    const round = fromBase64Url(toBase64Url(bytes));
    assert.deepEqual(Array.from(round), Array.from(bytes));
    const log = decodeRunLog(round);
    assert.equal(log.seed, 1337);
    assert.equal(log.ticks, sim.tick);
    assert.equal(log.simVersion, SIM_VERSION);
    const r = replay(round);
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(r.summary, sim.summary());
    assert.equal(r.hash, sim.stateHash());
    assert.ok(bytes.length < 16000, `log is compact (${bytes.length} bytes for ${sim.tick} ticks)`);
});

test('runlog: tampering is detected or changes the result', () => {
    const { sim, bytes } = playRecorded(2024, { surviveTicks: 60 * 60 });
    const honest = replay(bytes);
    assert.equal(honest.ok, true);
    // Truncated log.
    assert.equal(replay(bytes.slice(0, bytes.length - 3)).ok, false);
    // Different seed in the header → a different run (the claimed score no longer matches).
    const forged = bytes.slice();
    forged[4] ^= 0xff;
    const r = replay(forged);
    assert.ok(!r.ok || r.summary.score !== sim.summary().score);
    // Garbage.
    assert.equal(replay(new Uint8Array([1, 2, 3])).ok, false);
});

test('content: every reference resolves', () => {
    const enemyIds = new Set(Object.values(ENEMIES).map((e) => e.id));
    for (const w of WAVES)
        for (const id of w.pool) assert.ok(enemyIds.has(id), `wave ${w.label}: ${id}`);
    for (const s of Object.values(STAGES)) {
        for (const id of s.extraEnemies) assert.ok(enemyIds.has(id), `${s.id} extra ${id}`);
        for (const id of Object.keys(s.poolWeights))
            assert.ok(enemyIds.has(id), `${s.id} weight ${id}`);
        const plan = bossesFor(s.id);
        assert.ok(plan.length >= 4, `${s.id} has a boss plan`);
        assert.equal(plan.filter((b) => b.final).length, 1, `${s.id} has exactly one final boss`);
    }
    for (const b of Object.values(BOSSES))
        if (b.summon) assert.ok(enemyDef(b.summon), `${b.id} summon`);
    for (const e of Object.values(ENEMIES))
        if (e.splitInto) assert.ok(enemyDef(e.splitInto), `${e.id} split`);
    assert.equal(bossesFor('winter').find((b) => b.slot === 'liquidation').id, 'long_winter');
    const ids = [...Object.values(WEAPONS), ...Object.values(PASSIVES)].map((d) => d.id);
    assert.equal(new Set(ids).size, ids.length, 'unique weapon/passive ids');
    assert.ok(['chop', 'bear_trap', 'winter'].includes(stageForSeed(123)));
});

test('sim: level-up waits for a pick and applies it', () => {
    const sim = new Simulation({ seed: 5 });
    sim.player.gainExp(0);
    sim.pendingLevelUps = 1;
    sim.step(0);
    assert.ok(sim.choices && sim.choices.length === 3);
    const tick = sim.tick;
    assert.equal(sim.step(0), false, 'blocked while choosing');
    assert.equal(sim.tick, tick);
    const c = sim.choices[0];
    sim.choose(0);
    assert.equal(sim.choices, null);
    if (c.kind === 'weapon') assert.ok(sim.player.weapons.some((w) => w.id === c.id));
    if (c.kind === 'passive') assert.ok(sim.player.passives[c.id]);
    assert.equal(sim.step(0), true);
});

// --- characters in the run log ---------------------------------------------------------------------------------

/** Record a short bot run with a character, then play recklessly until it ends. */
function recordWith(seed, character, twist = null) {
    const sim = new Simulation({ seed, twist, character });
    const rec = new RunRecorder(seed, twist, sim.characterId);
    const calm = createBot();
    const reckless = createBot({ style: 'reckless' });
    while (!sim.over && sim.tick < SIM.MAX_TICKS) {
        if (sim.choices) {
            const i = calm.pick(sim);
            rec.pick(sim.tick, i);
            sim.choose(i);
            continue;
        }
        const code = (sim.tick < 60 * 30 ? calm : reckless).move(sim);
        rec.tick(code);
        sim.step(code);
        sim.drainEvents();
    }
    return { sim, bytes: rec.toBytes() };
}

test('characters: the bull is the default, index 0, and unknown ids are the bull', () => {
    assert.equal(CHARACTER_IDS[0], 'bull');
    for (const id of CHARACTER_IDS) {
        assert.ok(CHARACTERS[id], id);
        assert.ok(weaponDef(CHARACTERS[id].starterWeapon), `${id} starts with a real weapon`);
    }
    assert.equal(new Simulation({ seed: 3 }).characterId, 'bull');
    assert.equal(new Simulation({ seed: 3, character: 'nope' }).characterId, 'bull');
    assert.equal(characterDef('nope').id, 'bull');
});

test('runlog: the character is written into the log and the replay plays it', () => {
    // A throwaway second character that starts with another weapon, so a replay with the wrong one can't match.
    const other = Object.values(WEAPONS).find((w) => w.id !== CHARACTERS.bull.starterWeapon).id;
    CHARACTER_IDS.push('test_only');
    CHARACTERS.test_only = { id: 'test_only', name: 'Test', description: '', starterWeapon: other };
    try {
        const { sim, bytes } = recordWith(11, 'test_only');
        assert.equal(sim.summary().character, 'test_only');
        assert.equal(sim.summary().weapons[0][0], other);
        assert.equal(bytes[9], CHARACTER_IDS.indexOf('test_only'), 'character byte');
        const log = decodeRunLog(bytes);
        assert.equal(log.character, 'test_only');
        const r = replay(bytes);
        assert.ok(r.ok, r.error);
        assert.equal(r.character, 'test_only');
        assert.equal(r.hash, sim.stateHash());
        assert.deepEqual(r.summary, sim.summary());
        // the same inputs with the bull are a different run
        const asBull = bytes.slice();
        asBull[9] = 0;
        const rb = replay(asBull);
        assert.ok(!rb.ok || rb.hash !== sim.stateHash(), 'the character changes the run');
        const bad = bytes.slice();
        bad[9] = 250;
        assert.throws(() => decodeRunLog(bad), /unknown character/);
    } finally {
        CHARACTER_IDS.pop();
        delete CHARACTERS.test_only;
    }
});

test('runlog: version-2 logs (no character byte) decode and replay as the bull', () => {
    const { sim, bytes } = recordWith(5, 'bull');
    assert.equal(bytes[2], 3);
    const v2 = new Uint8Array(bytes.length - 1);
    v2.set(bytes.subarray(0, 9));
    v2.set(bytes.subarray(10), 9);
    v2[2] = 2;
    const log = decodeRunLog(v2);
    assert.equal(log.character, 'bull');
    const r = replay(v2);
    assert.ok(r.ok, r.error);
    assert.equal(r.hash, sim.stateHash());
});

test('opening bell: a ring of bears at 0.5 s, just off screen, so a run never starts empty', () => {
    const sim = new Simulation({ seed: 42 });
    while (sim.tick < SIM.OPENING_TICK) sim.step(0);
    const ring = sim.enemies.filter(
        (e) => Math.abs(Math.hypot(e.x - sim.player.x, e.y - sim.player.y) - SIM.OPENING_RADIUS) < 1
    );
    assert.equal(ring.length, SIM.OPENING_RING);
    // Past the edge of a desktop view (~550 x 360 half-extents) but close enough to arrive in seconds.
    assert.ok(SIM.OPENING_RADIUS > 550 && SIM.OPENING_RADIUS < SIM.SPAWN_RADIUS);
    let seen = null;
    while (sim.tick < 60 * 3 && seen === null) {
        sim.step(0);
        sim.drainEvents();
        const p = sim.player;
        if (sim.enemies.some((e) => Math.abs(e.x - p.x) < 550 && Math.abs(e.y - p.y) < 360))
            seen = sim.time;
    }
    assert.ok(seen !== null && seen < 3, `a bear is on a desktop screen within 3 s (${seen})`);
});
