// Liquidation Risk (Build #18): Leverage evolves at 5 stacks. +10% crit, every crit chains to the 2 nearest bears
// not hit yet (each within 140 of the last), and the bull takes 2x damage (1.75x from the stacks, +0.25).

import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/sim.js';
import { Enemy } from '../src/sim/entities.js';
import { RunRecorder, replay } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { PASSIVES, SIM, enemyDef } from '../src/sim/content.js';
import { guideSections } from '../src/guide.js';

const LEV = PASSIVES.LEVERAGE;

/** A bull with `stacks` Leverage and hand-placed bag holders at [x, y] offsets. */
function field(positions, stacks = SIM.PASSIVE_MAX_STACK) {
    const sim = new Simulation({ seed: 18 });
    for (let i = 0; i < stacks; i++) sim.player.addPassive(LEV);
    const def = enemyDef('bag_holder');
    sim.enemies = positions.map(
        ([x, y]) => new Enemy(sim.player.x + x, sim.player.y + y, def, 1, 1, sim)
    );
    sim.spatial.rebuild(sim.enemies);
    sim.drainEvents();
    return sim;
}

test('liquidation risk: the data, the guide line, and the 5th Leverage card evolves', () => {
    assert.equal(LEV.evolveName, 'Liquidation Risk');
    assert.equal(LEV.evolveCrit, 0.1);
    assert.equal(LEV.evolveChainJumps, 2);
    assert.equal(LEV.evolveChainRange, 140);
    assert.equal(LEV.evolveDamageTaken, 0.25);
    const entry = guideSections()
        .find((s) => s.id === 'passives')
        .entries.find((e) => e.id === 'leverage');
    assert.equal(entry.extra, `5× → Liquidation Risk: ${LEV.evolveDescription}`);
    assert.ok(entry.evolves);

    const card = (stacks) =>
        field([], stacks)
            ._upgradePool()
            .live.find((c) => c.id === 'leverage');
    assert.ok(!card(3).evolves, 'the 4th stack is a plain level');
    assert.equal(card(4).level, 5);
    assert.ok(card(4).evolves, 'the 5th stack evolves');

    // picking it emits the evolve event (the toast)
    const sim = field([], 4);
    sim.choices = [card(4)];
    sim.pendingLevelUps = 1;
    sim.choose(0);
    assert.equal(sim.player.passives.leverage.count, 5);
    assert.ok(sim.drainEvents().some((e) => e.t === 'evolve' && e.id === 'leverage'));
});

test('liquidation risk: +10% crit only once evolved, on top of Alpha', () => {
    assert.equal(field([], 4).player.getCritChance(), 0);
    assert.equal(field([], 5).player.getCritChance(), 0.1);
    const sim = field([], 5);
    sim.player.addPassive(PASSIVES.ALPHA);
    assert.ok(Math.abs(sim.player.getCritChance() - 0.15) < 1e-12);
});

test('liquidation risk: a crit chains to the 2 nearest bears in range, nearest first', () => {
    // A is hit; B is 60 from A, C 100 from A but 116 from B; D is 80 past C (a 3rd jump); E is 150 from all.
    const sim = field([
        [200, 0],
        [200, 60],
        [300, 0],
        [380, 0],
        [200, -150]
    ]);
    const [a, b, c, d, e] = sim.enemies;
    const hp = b.hp;
    sim.damageEnemy(a, 10, true, 'laser_eyes');
    assert.equal(a.hp, hp - 10);
    assert.equal(b.hp, hp - 10, 'first jump: the nearest bear');
    assert.equal(c.hp, hp - 10, 'second jump: nearest to the first');
    assert.equal(d.hp, hp, 'only 2 jumps');
    assert.equal(e.hp, hp, 'out of range');
    assert.equal(sim.stats.liquidations, 2);
    const arcs = sim.drainEvents().filter((ev) => ev.t === 'liquidation');
    assert.deepEqual(
        arcs.map((ev) => [ev.x1, ev.y1, ev.x2, ev.y2, ev.k]),
        [
            [a.x, a.y, b.x, b.y, 0],
            [b.x, b.y, c.x, c.y, 1]
        ]
    );
});

test('liquidation risk: no chain without a crit, without the evolution, or out of range', () => {
    const near = [
        [200, 0],
        [260, 0]
    ];
    const plain = field(near);
    plain.damageEnemy(plain.enemies[0], 10, false, 'laser_eyes');
    assert.equal(plain.enemies[1].hp, plain.enemies[1].maxHp, 'not a crit');

    const four = field(near, 4);
    four.damageEnemy(four.enemies[0], 10, true, 'laser_eyes');
    assert.equal(four.enemies[1].hp, four.enemies[1].maxHp, '4 stacks: not evolved');

    const candle = field(near);
    candle.damageEnemy(candle.enemies[0], 10, true, 'god_candle');
    assert.equal(
        candle.enemies[1].hp,
        candle.enemies[1].maxHp,
        "God Candle's boss hit isn't a crit"
    );

    const far = field([
        [200, 0],
        [200 + LEV.evolveChainRange + 1, 0]
    ]);
    far.damageEnemy(far.enemies[0], 10, true, 'laser_eyes');
    assert.equal(far.enemies[1].hp, far.enemies[1].maxHp, 'just out of range');
    assert.equal(far.stats.liquidations, 0);
});

test('liquidation risk: a dead bear is skipped, and a chain hit never chains again', () => {
    const sim = field([
        [200, 0],
        [240, 0],
        [300, 0]
    ]);
    const [a, b, c] = sim.enemies;
    b.hp = 0; // killed earlier this tick
    sim.damageEnemy(a, 10, true, 'horns');
    assert.equal(c.hp, c.maxHp - 10, 'skips the dead one and reaches the next');
    assert.equal(sim.stats.liquidations, 1);

    const lone = field([
        [200, 0],
        [260, 0]
    ]);
    lone.damageEnemy(lone.enemies[0], 10, true, 'liquidation');
    assert.equal(lone.stats.liquidations, 0);
});

test('liquidation risk: the catch, 2x damage taken, only once evolved', () => {
    const none = field([], 0);
    const four = field([], 4);
    const five = field([], 5);
    assert.equal(none.player.getDamageTakenMult(), 1);
    assert.ok(Math.abs(four.player.getDamageTakenMult() - 1.6) < 1e-12, '4 stacks: +60%');
    assert.ok(Math.abs(five.player.getDamageTakenMult() - 2) < 1e-12, '5 stacks + evolution: 2x');
    five.player.takeDamage(20, five);
    assert.ok(Math.abs(five.player.hp - (five.player.maxHp - 40)) < 1e-9, `hp ${five.player.hp}`);
});

test('liquidation risk: a run that evolves Leverage chains and replays bit for bit', () => {
    const play = (seed) => {
        const sim = new Simulation({ seed });
        const rec = new RunRecorder(seed, null, sim.characterId);
        const bot = createBot();
        while (!sim.over && sim.tick < SIM.MAX_TICKS) {
            if (sim.choices) {
                const l = sim.choices.findIndex((c) => c.id === 'leverage');
                const i = l >= 0 ? l : bot.pick(sim);
                rec.pick(sim.tick, i);
                sim.choose(i);
                continue;
            }
            const code = bot.move(sim);
            rec.tick(code);
            sim.step(code);
            sim.drainEvents();
        }
        return { sim, rec };
    };
    let run = null;
    for (let seed = 1; seed <= 12 && !run; seed++) {
        const r = play(seed);
        if (r.sim.player.evolvedPassive('leverage')) run = r;
    }
    assert.ok(run, 'some run evolved Leverage');
    const { sim, rec } = run;
    assert.ok(sim.stats.liquidations > 20, `${sim.stats.liquidations} chain hits`);
    const r = replay(rec.toBytes());
    assert.ok(r.ok, r.error);
    assert.equal(r.hash, sim.stateHash());
    assert.deepEqual(r.summary, sim.summary());
});
