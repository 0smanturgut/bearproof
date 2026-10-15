/**
 * @module nevermore/core
 * @description The replay engine. Pure ES module with no Node imports, so the same code runs headless in Node and
 * inside Chromium (`--browser`). It drives the game's OWN simulation module (passed in), never a copy.
 *
 *   const result = runSpec({ Simulation, createBot, content }, spec);
 *   // → { id, status: 'pass' | 'fail' | 'error', scenario: {…}, generalise: {…} }
 */

import { snapshot } from './snapshot.mjs';
import { dueAt, makeChecker } from './invariants.mjs';

/** FNV-1a over a string → u32. */
export function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
}

/** The k-th generalisation seed of a spec. `offset` moves the whole seed set (used by measurement repeats). */
export function generaliseSeed(spec, k, offset = 0) {
    return fnv1a(`${spec.id}:${spec.scenario.seed}:${offset}:${k}`);
}

/**
 * Watches a running sim and checks one invariant at its cadence. `prev` is always the previous tick's snapshot
 * (or the state just before a level-up pick), whatever the cadence.
 */
export function createObserver(checker, { content = null } = {}) {
    const rate = content?.SIM?.TICK_RATE || 60;
    let prev = null;
    let failure = null;
    let checks = 0;
    let applicable = false;
    return {
        get failure() {
            return failure;
        },
        get checks() {
            return checks;
        },
        get applicable() {
            return applicable;
        },
        observe(sim, force = false) {
            if (failure) return failure;
            const due = force || dueAt(checker.every, sim.tick, rate);
            if (!due && !checker.needsPrev) return null;
            const snap = snapshot(sim, { lists: checker.needsLists && due, content });
            if (due && checker.applies(snap)) {
                applicable = true;
                checks++;
                const msg = checker.check(snap, prev);
                if (msg) failure = { tick: snap.tick, message: String(msg).slice(0, 300) };
            }
            prev = snap;
            return failure;
        }
    };
}

/** Iterate a run-length encoded input: `next()` gives the next move code or null when the log is exhausted. */
function codeStream(runs) {
    let i = 0;
    let left = runs.length ? runs[0][1] : 0;
    return {
        next() {
            while (i < runs.length && left === 0) {
                i++;
                left = i < runs.length ? runs[i][1] : 0;
            }
            if (i >= runs.length) return null;
            left--;
            return runs[i][0];
        }
    };
}

const drain = (sim) => {
    if (typeof sim.drainEvents === 'function') sim.drainEvents();
    else if (Array.isArray(sim.events)) sim.events.length = 0;
};

/**
 * Replay a scenario on the given build. Picks are applied in recorded order whenever the sim offers cards; if the
 * recorded pick's tick doesn't line up (the build changed), its index is used anyway. Stops at `untilTick`, at the
 * end of the run, or when the input log runs out.
 * @param {{ Simulation: any, content?: any }} mods
 * @param {object} scenario
 * @param {{ observe?: (sim:any, force?:boolean)=>any, stopOnFailure?: boolean, onTick?: (sim:any)=>void }} [hooks]
 */
export function replayScenario(mods, scenario, hooks = {}) {
    const sim = new mods.Simulation({
        seed: scenario.seed,
        twist: scenario.twist && scenario.twist !== 'none' ? scenario.twist : null,
        character: scenario.character || null
    });
    const codes = codeStream(scenario.runs);
    const picks = scenario.picks || [];
    let pi = 0;
    let misaligned = 0;
    let defaultPicks = 0;
    let exhausted = false;
    const observe = hooks.observe || (() => null);
    const stop = () => hooks.stopOnFailure !== false && observe.failed?.();
    observe(sim);
    while (!sim.over && sim.tick < scenario.untilTick) {
        let guard = 0;
        while (sim.choices && guard++ < 64) {
            const pick = picks[pi];
            if (pick) {
                if (pick[0] !== sim.tick) misaligned++;
                sim.choose(pick[1]);
                pi++;
            } else {
                sim.choose(0);
                defaultPicks++;
            }
            drain(sim);
            if (observe(sim)) break;
        }
        if (stop()) break;
        const code = codes.next();
        if (code === null) {
            exhausted = true;
            break;
        }
        sim.step(code);
        drain(sim);
        hooks.onTick?.(sim);
        if (observe(sim) && hooks.stopOnFailure !== false) break;
    }
    return {
        sim,
        misalignedPicks: misaligned,
        defaultPicks,
        unusedPicks: picks.length - pi,
        logExhausted: exhausted
    };
}

function stateHash(sim) {
    try {
        return typeof sim.stateHash === 'function' ? sim.stateHash() : null;
    } catch {
        return null;
    }
}

/** Run one spec's scenario with its invariant. */
export function runScenario(mods, spec, checker = makeChecker(spec.invariant)) {
    const obs = createObserver(checker, { content: mods.content });
    const observe = (sim, force) => obs.observe(sim, force);
    observe.failed = () => !!obs.failure;
    const r = replayScenario(mods, spec.scenario, { observe });
    if (!obs.failure) obs.observe(r.sim, true); // always check the final state
    const f = obs.failure;
    return {
        status: f ? 'fail' : 'pass',
        tick: f ? f.tick : null,
        message: f ? f.message : null,
        ticks: r.sim.tick,
        over: !!r.sim.over,
        endReason: r.sim.endReason ?? null,
        checks: obs.checks,
        applicable: obs.applicable,
        misalignedPicks: r.misalignedPicks,
        defaultPicks: r.defaultPicks,
        unusedPicks: r.unusedPicks,
        logExhausted: r.logExhausted,
        hash: stateHash(r.sim)
    };
}

/** Drive a fresh run with the game's own bot, checking the invariant. */
export function runBot(
    mods,
    { seed, twist = null, character = null, style = 'survive', ticks },
    checker
) {
    if (typeof mods.createBot !== 'function')
        throw new Error('this build has no bot (src/sim/bot.js)');
    const sim = new mods.Simulation({
        seed,
        twist: twist && twist !== 'none' ? twist : null,
        character: character || null
    });
    const bot = mods.createBot({ style, phase: seed % 997 });
    const obs = checker ? createObserver(checker, { content: mods.content }) : null;
    obs?.observe(sim);
    while (!sim.over && sim.tick < ticks) {
        if (sim.choices) {
            sim.choose(bot.pick(sim));
            drain(sim);
            if (obs?.observe(sim)) break;
            continue;
        }
        sim.step(bot.move(sim));
        drain(sim);
        if (obs?.observe(sim)) break;
    }
    if (obs && !obs.failure) obs.observe(sim, true);
    return { sim, failure: obs?.failure || null, checks: obs?.checks || 0 };
}

/** The generalisation pass: N seeds driven by the game's own bot, same twist and character as the scenario. */
export function runGeneralise(
    mods,
    spec,
    checker = makeChecker(spec.invariant),
    { seedOffset = 0 } = {}
) {
    const g = spec.generalise;
    const failures = [];
    let ticks = 0;
    for (let k = 0; k < g.seeds; k++) {
        const seed = generaliseSeed(spec, k, seedOffset);
        const r = runBot(
            mods,
            {
                seed,
                twist: spec.scenario.twist,
                character: spec.scenario.character,
                style: g.bot,
                ticks: g.ticks
            },
            checker
        );
        ticks += r.sim.tick;
        if (r.failure) failures.push({ seed, tick: r.failure.tick, message: r.failure.message });
    }
    return { status: failures.length ? 'fail' : 'pass', seeds: g.seeds, ticks, failures };
}

/** Scenario + generalisation for one spec. Never throws: a broken build or spec is an 'error' result. */
export function runSpec(mods, spec, { seedOffset = 0, generalise = true } = {}) {
    const t0 = Date.now();
    const out = {
        id: spec.id,
        name: spec.name,
        status: 'error',
        scenario: null,
        generalise: null,
        error: null,
        ms: 0
    };
    try {
        const checker = makeChecker(spec.invariant);
        out.scenario = runScenario(mods, spec, checker);
        out.generalise = generalise
            ? runGeneralise(mods, spec, checker, { seedOffset })
            : { status: 'skipped', seeds: 0, ticks: 0, failures: [] };
        out.status =
            out.scenario.status === 'fail' || out.generalise.status === 'fail' ? 'fail' : 'pass';
    } catch (e) {
        out.error = String(e?.message || e).slice(0, 300);
    }
    out.ms = Date.now() - t0;
    return out;
}
