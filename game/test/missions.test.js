import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    MISSIONS,
    MISSION_BY_ID,
    MISSION_TABS,
    completeMissions,
    createMissionTracker,
    mergeBest,
    missionApplies,
    missionProgress,
    missionRatio,
    missionTab,
    missionTotals,
    nextMission,
    normalizeMissions
} from '../src/missions.js';
import { applyRun, defaultProfile, normalizeProfile } from '../src/profile.js';
import { ICONS, SPRITES } from '../src/art/sprites.js';
import { CHARACTER_IDS, STAGE_ROTATION } from '../src/sim/content.js';
import { Simulation } from '../src/sim/sim.js';
import { createBot } from '../src/sim/bot.js';

/** A stand-in for the Simulation with only what missions read. */
function fake(o = {}) {
    return {
        time: 0,
        won: false,
        eraIndex: 0,
        ...o,
        player: { level: 1, ...o.player },
        stats: {
            damageTaken: 0,
            kills: 0,
            smashed: 0,
            bossKills: 0,
            swept: 0,
            wallHits: 0,
            ...o.stats
        }
    };
}
const ids = (list) => list.map((m) => m.id);
const run = (o = {}) => ({
    timeMs: 60000,
    kills: 0,
    bossKills: 0,
    bossDamage: 0,
    score: 100,
    won: false,
    character: 'bull',
    stage: 'chop',
    ...o
});

test('missions: unique ids, words, rewards, a real scope, and art that exists', () => {
    assert.ok(MISSIONS.length >= 24);
    assert.equal(new Set(ids(MISSIONS)).size, MISSIONS.length);
    for (const m of MISSIONS) {
        assert.match(m.id, /^[a-z0-9_]{1,24}$/);
        assert.ok(m.name && m.text.endsWith('.'), m.id);
        assert.ok(Number.isInteger(m.reward) && m.reward > 0 && m.reward <= 500, m.id);
        assert.ok(['time', 'count', 'era', 'once'].includes(m.unit), m.id);
        assert.ok(m.target > 0, m.id);
        assert.ok(m.art in ICONS || m.art in SPRITES, `${m.id}: art "${m.art}" exists`);
        if (m.character) assert.ok(CHARACTER_IDS.includes(m.character), m.id);
        if (m.stage) assert.ok(STAGE_ROTATION.includes(m.stage), m.id);
        assert.ok(
            MISSION_TABS.some((t) => t.id === missionTab(m)),
            m.id
        );
    }
    // every character and every map has missions of its own
    for (const c of CHARACTER_IDS)
        assert.ok(
            MISSIONS.some((m) => m.character === c),
            c
        );
    for (const s of STAGE_ROTATION)
        assert.ok(
            MISSIONS.some((m) => m.stage === s),
            s
        );
});

test('missions: a run only moves the missions for its character and map', () => {
    const t = createMissionTracker(null, 'pepe', 'chop');
    const a = ids(t.active);
    assert.ok(a.includes('any_3min') && a.includes('pepe_5min') && a.includes('chop_10min'));
    assert.ok(!a.some((id) => id.startsWith('bull_') || id.startsWith('whale_')));
    assert.ok(!a.some((id) => id.startsWith('winter_') || id.startsWith('eras_')));
    assert.ok(missionApplies(MISSION_BY_ID.eras_defi, 'whale', 'eras'));
    assert.ok(!missionApplies(MISSION_BY_ID.eras_defi, 'whale', 'chop'));
    // done missions don't watch again
    const done = completeMissions(null, ['any_3min'], '2026-10-20');
    assert.ok(!ids(createMissionTracker(done, 'pepe', 'chop').active).includes('any_3min'));
});

test('missions: a time goal completes once, the step it is reached', () => {
    const t = createMissionTracker(null, 'bull', 'chop');
    assert.deepEqual(ids(t.observe(fake({ time: 179.9 }))), []);
    assert.ok(Math.abs(t.best.any_3min - 179.9) < 1e-9);
    assert.deepEqual(ids(t.observe(fake({ time: 180 }))), ['any_3min']);
    assert.deepEqual(ids(t.observe(fake({ time: 181 }))), [], 'never twice');
    assert.equal(t.best.any_3min, 180, 'progress is capped at the target');
    assert.deepEqual(ids(t.observe(fake({ time: 300 }))), ['bull_5min']);
});

test('missions: count goals read the run’s stats; several can finish on one step', () => {
    const t = createMissionTracker(null, 'whale', 'chop');
    const fresh = t.observe(
        fake({
            stats: { kills: 500, smashed: 25, swept: 200, wallHits: 999 },
            player: { level: 30 }
        })
    );
    assert.deepEqual(ids(fresh).sort(), ['any_lv30', 'any_piggy', 'any_rekt500', 'whale_sweep']);
    assert.equal(t.best.whale_wall, 999);
    assert.deepEqual(ids(t.observe(fake({ stats: { wallHits: 1000 } }))), ['whale_wall']);
});

test('missions: a clean boss fight is one with no hit between the boss arriving and falling', () => {
    // clean: no damage from spawn to kill
    let t = createMissionTracker(null, 'bull', 'chop');
    t.observe(fake({ time: 300, stats: { damageTaken: 40 } }), [{ t: 'boss', id: 'rug_lord' }]);
    const won = t.observe(fake({ time: 340, stats: { damageTaken: 40, bossKills: 1 } }), [
        { t: 'bossDown', id: 'rug_lord' }
    ]);
    assert.ok(ids(won).includes('bull_rug_clean'), 'damage before the fight does not count');

    // a hit mid-fight spoils it, even if the bull heals
    t = createMissionTracker(null, 'bull', 'chop');
    t.observe(fake({ time: 300 }), [{ t: 'boss', id: 'rug_lord' }]);
    t.observe(fake({ time: 310, stats: { damageTaken: 5 } }));
    const dirty = t.observe(fake({ time: 340, stats: { damageTaken: 5, bossKills: 1 } }), [
        { t: 'bossDown', id: 'rug_lord' }
    ]);
    assert.ok(!ids(dirty).includes('bull_rug_clean'));
    assert.ok(t.run.bosses.has('rug_lord'));

    // a hit on the killing step spoils it too
    t = createMissionTracker(null, 'bull', 'chop');
    t.observe(fake({ time: 300 }), [{ t: 'boss', id: 'rug_lord' }]);
    const late = t.observe(fake({ time: 340, stats: { damageTaken: 1, bossKills: 1 } }), [
        { t: 'bossDown', id: 'rug_lord' }
    ]);
    assert.ok(!ids(late).includes('bull_rug_clean'));
});

test('missions: a boss goal is the boss in its own place (Pepe and Capitulation, Bear Trap’s Rug Lord)', () => {
    const t = createMissionTracker(null, 'pepe', 'bear_trap');
    const fresh = t.observe(fake({ stats: { damageTaken: 10, bossKills: 2 } }), [
        { t: 'bossDown', id: 'rug_lord' },
        { t: 'bossDown', id: 'capitulation' }
    ]);
    assert.deepEqual(ids(fresh).sort(), ['any_bosses2', 'pepe_capitulation', 'trap_rug']);
});

test('missions: Pepe’s streak is the longest stretch without a hit', () => {
    const t = createMissionTracker(null, 'pepe', 'chop');
    t.observe(fake({ time: 120 }));
    t.observe(fake({ time: 121, stats: { damageTaken: 3 } }));
    assert.equal(t.run.streak, 120);
    const quiet = (time) => ids(t.observe(fake({ time, stats: { damageTaken: 3 } })));
    assert.ok(!quiet(300).includes('pepe_untouched'));
    assert.ok(quiet(301).includes('pepe_untouched'));
});

test('missions: Market Eras goals follow the era', () => {
    const t = createMissionTracker(null, 'bull', 'eras');
    assert.deepEqual(ids(t.observe(fake({ eraIndex: 1 }))), ['eras_defi']);
    assert.deepEqual(ids(t.observe(fake({ eraIndex: 3 }))).sort(), ['eras_alt', 'eras_bear']);
    assert.equal(missionProgress(MISSION_BY_ID.eras_bear, 2), 'Best: Altcoin Season');
});

test('missions: done ones are saved at once and paid on the next receipt, once', () => {
    const p = defaultProfile();
    p.missions = completeMissions(p.missions, ['any_3min', 'bull_5min', 'nope'], '2026-10-20');
    assert.deepEqual(p.missions.unpaid, ['any_3min', 'bull_5min']);
    assert.equal(p.missions.done.any_3min, '2026-10-20');

    const r = applyRun(p, run({ timeMs: 300000 }), { missionBest: { any_rekt500: 212 } });
    const lines = r.payout.lines.filter((l) => l.id === 'mission');
    assert.deepEqual(
        lines.map((l) => [l.detail, l.v]),
        [
            ['Opening Range', 50],
            ['Market Open', 100]
        ]
    );
    assert.equal(
        r.payout.total,
        r.payout.lines.reduce((a, l) => a + l.v, 0)
    );
    assert.equal(r.profile.clout, r.payout.total + r.levelReward + r.bear.reward);
    assert.deepEqual(r.profile.missions.unpaid, []);
    assert.equal(r.profile.missions.best.any_rekt500, 212);

    // the next run pays nothing for them again, and the best only goes up
    const r2 = applyRun(r.profile, run(), { missionBest: { any_rekt500: 100, any_3min: 30 } });
    assert.ok(!r2.payout.lines.some((l) => l.id === 'mission'));
    assert.equal(r2.profile.missions.best.any_rekt500, 212);
    assert.equal(r2.profile.missions.best.any_3min, undefined, 'a done mission keeps no progress');
});

test('missions: old saves, junk and hand-edits come out valid', () => {
    assert.deepEqual(normalizeProfile({ clout: 5 }).missions, { done: {}, best: {}, unpaid: [] });
    assert.deepEqual(normalizeProfile(null).missions, { done: {}, best: {}, unpaid: [] });
    const st = normalizeMissions({
        done: { any_3min: '2026-10-20T10:00:00Z', fake: '2026-10-20' },
        best: { any_rekt500: 99999, bull_5min: -4, any_lv30: NaN, gone: 3 },
        unpaid: ['any_3min', 'any_3min', 'bull_5min', 'fake']
    });
    assert.deepEqual(st.done, { any_3min: '2026-10-20' });
    assert.deepEqual(st.best, { any_rekt500: 500 });
    assert.deepEqual(st.unpaid, ['any_3min'], 'only done ids, once');
    assert.deepEqual(normalizeMissions('junk'), { done: {}, best: {}, unpaid: [] });
    // a hand-edited save can't pay a mission twice in one receipt
    const p = normalizeProfile({
        missions: { done: { any_win: 'x' }, unpaid: ['any_win', 'any_win'] }
    });
    const r = applyRun(p, run());
    assert.equal(r.payout.lines.filter((l) => l.id === 'mission').length, 1);
});

test('missions: the start screen’s pick, totals and progress words', () => {
    assert.equal(nextMission(null, 'pepe').id, 'pepe_5min');
    let st = completeMissions(
        null,
        MISSIONS.filter((m) => m.character === 'pepe').map((m) => m.id),
        'd'
    );
    assert.equal(nextMission(st, 'pepe').id, 'any_3min', 'then a mission for any run');
    st = completeMissions(
        st,
        MISSIONS.filter((m) => !m.character && !m.stage).map((m) => m.id),
        'd'
    );
    assert.equal(nextMission(st, 'pepe'), null);
    const tot = missionTotals(null);
    assert.equal(tot.done, 0);
    assert.equal(tot.total, MISSIONS.length);
    assert.equal(
        tot.left,
        MISSIONS.reduce((a, m) => a + m.reward, 0)
    );
    assert.equal(
        missionTotals(st).done,
        4 + MISSIONS.filter((m) => !m.character && !m.stage).length
    );
    assert.equal(missionProgress(MISSION_BY_ID.bull_5min, 192.6), '3:12 / 5:00');
    assert.equal(missionProgress(MISSION_BY_ID.bull_1000, 212), '212 / 1,000');
    assert.equal(missionProgress(MISSION_BY_ID.any_win, 0), '');
    const half = mergeBest(null, { any_rekt500: 250 });
    assert.equal(missionRatio(half, MISSION_BY_ID.any_rekt500), 0.5);
    assert.equal(
        missionRatio(completeMissions(half, ['any_rekt500'], 'd'), MISSION_BY_ID.any_rekt500),
        1
    );
});

test('missions: a tracker never changes the run it watches (same seed, same state)', () => {
    const play = (watch) => {
        const sim = new Simulation({ seed: 4242, character: 'pepe' });
        const t = watch ? createMissionTracker(null, sim.characterId, sim.stageId) : null;
        const bot = createBot({ style: 'survive', phase: 7 });
        while (!sim.over && sim.tick < 60 * 90) {
            while (sim.choices) {
                sim.choose(bot.pick(sim));
                t?.observe(sim, sim.drainEvents());
            }
            sim.step(bot.move(sim));
            const ev = sim.drainEvents();
            t?.observe(sim, ev);
        }
        return { hash: sim.stateHash(), t };
    };
    const a = play(false);
    const b = play(true);
    assert.equal(a.hash, b.hash);
    assert.ok(b.t.best.any_3min > 0, 'it did watch');
});

test('missions: every map and character runs a tracker on the real sim without trouble', () => {
    for (const stage of STAGE_ROTATION)
        for (const character of CHARACTER_IDS) {
            const sim = new Simulation({ seed: 77, stage, character });
            const t = createMissionTracker(null, character, stage);
            const bot = createBot({ style: 'survive', phase: 3 });
            while (!sim.over && sim.tick < 60 * 40) {
                while (sim.choices) sim.choose(bot.pick(sim));
                sim.step(bot.move(sim));
                for (const m of t.observe(sim, sim.drainEvents()))
                    assert.ok(
                        missionApplies(m, character, stage),
                        `${m.id} on ${character}/${stage}`
                    );
            }
            for (const [id, v] of Object.entries(t.best)) {
                assert.ok(Number.isFinite(v) && v >= 0, `${id} ${v}`);
                assert.ok(v <= MISSION_BY_ID[id].target);
            }
        }
});
