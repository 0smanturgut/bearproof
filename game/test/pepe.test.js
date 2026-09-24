// Pepe, the second character (Build #3): his stats, his Tongue Lash, and that his runs replay as Pepe.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy } from '../src/sim/entities.js';
import { RunRecorder, decodeRunLog, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { CHARACTERS, CHARACTER_IDS, SIM, enemyDef } from '../src/sim/content.js';

/** A Pepe sim with hand-placed bag holders and nothing else on the field. */
function field(positions, { level = 1 } = {}) {
    const sim = new Simulation({ seed: 7, character: 'pepe' });
    const def = enemyDef('bag_holder');
    sim.enemies = positions.map(([x, y]) => new Enemy(x, y, def, 1, 1, sim));
    sim.spatial.rebuild(sim.enemies);
    const tongue = sim.player.weapons[0];
    tongue.level = level;
    return { sim, tongue, hit: () => sim.enemies.map((e) => e.hp < e.maxHp) };
}

test('pepe: index 1, starts with the Tongue Lash, 90 HP and 10% faster', () => {
    assert.equal(CHARACTER_IDS.indexOf('pepe'), 1, 'append-only: pepe is byte 1');
    const sim = new Simulation({ seed: 3, character: 'pepe' });
    assert.equal(sim.characterId, 'pepe');
    assert.deepEqual(
        sim.player.weapons.map((w) => w.id),
        ['tongue']
    );
    assert.equal(sim.player.hp, 90);
    assert.equal(sim.player.maxHp, 90);
    assert.ok(Math.abs(sim.player.getSpeedMult() - 1.1) < 1e-12);
    // the bull keeps his numbers
    const bull = new Simulation({ seed: 3 });
    assert.equal(bull.player.maxHp, SIM.PLAYER_HP);
    assert.equal(bull.player.getSpeedMult(), 1);
    assert.equal(CHARACTERS.pepe.sprite, 'pepe');
});

test('tongue: hits every bear on the line to the nearest one, and nothing off it', () => {
    const { sim, tongue, hit } = field([
        [100, 0], // nearest: the aim
        [200, 6], // further along the line
        [150, 90], // off to the side
        [-120, 0], // behind
        [320, 0] // past the tip
    ]);
    tongue.fire(sim.player, sim);
    assert.deepEqual(hit(), [true, true, false, false, false]);
    const ev = sim.drainEvents();
    assert.equal(ev.filter((e) => e.t === 'tongue').length, 1);
    assert.ok(ev.some((e) => e.t === 'fire' && e.w === 'tongue'));
});

test('tongue: does nothing with no bear in range', () => {
    const { sim, tongue, hit } = field([[600, 0]]);
    tongue.fire(sim.player, sim);
    assert.deepEqual(hit(), [false]);
    assert.equal(sim.drainEvents().length, 0);
});

test('tongue: Liquidity Grab (level 5) lashes three tongues in a fan', () => {
    // one bear straight ahead, one ~22° off each side; level 1 only reaches the middle one
    const spots = [
        [120, 0],
        [185, 75],
        [185, -75]
    ];
    const weak = field(spots);
    weak.tongue.fire(weak.sim.player, weak.sim);
    assert.deepEqual(weak.hit(), [true, false, false]);
    const evolved = field(spots, { level: 5 });
    assert.ok(evolved.tongue.isEvolved());
    evolved.tongue.fire(evolved.sim.player, evolved.sim);
    assert.deepEqual(evolved.hit(), [true, true, true]);
    assert.equal(evolved.sim.drainEvents().filter((e) => e.t === 'tongue').length, 3);
});

test("tongue: a signature weapon, only on Pepe's level-up cards", () => {
    const pepe = new Simulation({ seed: 4, character: 'pepe' });
    const bull = new Simulation({ seed: 4 });
    assert.ok(pepe._upgradePool().live.some((c) => c.id === 'tongue'));
    assert.ok(!bull._upgradePool().live.some((c) => c.id === 'tongue'));
});

test('runlog: a Pepe run replays as Pepe, and differs as the bull', () => {
    const seed = 21;
    const sim = new Simulation({ seed, character: 'pepe' });
    const rec = new RunRecorder(seed, null, sim.characterId);
    const bot = createBot();
    const reckless = createBot({ style: 'reckless' });
    while (!sim.over && sim.tick < SIM.MAX_TICKS) {
        if (sim.choices) {
            const i = bot.pick(sim);
            rec.pick(sim.tick, i);
            sim.choose(i);
            continue;
        }
        const code = (sim.tick < 60 * 30 ? bot : reckless).move(sim);
        rec.tick(code);
        sim.step(code);
        sim.drainEvents();
    }
    const bytes = rec.toBytes();
    assert.equal(decodeRunLog(bytes).character, 'pepe');
    const r = replay(bytes);
    assert.ok(r.ok, r.error);
    assert.equal(r.hash, sim.stateHash());
    assert.deepEqual(r.summary, sim.summary());
    const asBull = bytes.slice();
    asBull[9] = 0;
    const rb = replay(asBull);
    assert.ok(!rb.ok || rb.hash !== sim.stateHash());
});
