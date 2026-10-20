/**
 * @module missions
 * @description Missions (Build #28): goals for any run, for each character and for each map, that pay CLOUT once.
 * Like badges they only read the simulation's state and events after each step, so they never change a run, a
 * replay or the Daily board. Their state lives in the profile (prefs.profile.missions): what's done, the best
 * progress so far, and what's done but not paid yet. A mission that completes mid-run is saved at once; the next
 * receipt pays it (profile.js applyRun), so closing the tab mid-run never loses it. No DOM.
 */

import { CHARACTERS, getStage } from './sim/content.js';

/** The Missions screen's tabs, in order. A mission's tab is its character, else 'maps' if it has a stage, else 'any'. */
export const MISSION_TABS = Object.freeze([
    { id: 'any', label: 'Any run' },
    { id: 'bull', label: 'Bull' },
    { id: 'pepe', label: 'Pepe' },
    { id: 'whale', label: 'Whale' },
    { id: 'miner', label: 'Miner' },
    { id: 'maps', label: 'Maps' }
]);

const ERA_NAMES = ['Genesis Era', 'DeFi Summer', 'Altcoin Season', 'The Bear Market'];

const time = (s) => s.time;
const boss = (id) => (s, run) => (run.bosses.has(id) ? 1 : 0);
const clean = (id) => (s, run) => (run.clean.has(id) ? 1 : 0);

/**
 * Append-only by habit: the id is what a device stores. `character` / `stage` scope a mission (a run on another
 * character or map can't move it). `unit`: 'time' (seconds), 'count', 'era' (an era index) or 'once' (0 or 1).
 * `value(sim, run)` is the run's progress so far; the mission completes when it reaches `target`.
 */
export const MISSIONS = Object.freeze([
    // --- any run
    {
        id: 'any_3min',
        name: 'Opening Range',
        text: 'Survive 3:00.',
        art: 'dca',
        reward: 50,
        unit: 'time',
        target: 180,
        value: time
    },
    {
        id: 'any_rekt500',
        name: 'Five Hundred Rekt',
        text: 'Rekt 500 bears in one run.',
        art: 'red_candle',
        reward: 100,
        unit: 'count',
        target: 500,
        value: (s) => s.stats.kills
    },
    {
        id: 'any_piggy',
        name: 'Piggy Bank Run',
        text: 'Smash 25 piggy banks in one run.',
        art: 'compounding',
        reward: 100,
        unit: 'count',
        target: 25,
        value: (s) => s.stats.smashed
    },
    {
        id: 'any_lv30',
        name: 'Level 30',
        text: 'Reach level 30 in one run.',
        art: 'alpha',
        reward: 120,
        unit: 'count',
        target: 30,
        value: (s) => s.player.level
    },
    {
        id: 'any_bosses2',
        name: 'Double Top',
        text: 'Take down 2 bosses in one run.',
        art: 'rug_lord',
        reward: 150,
        unit: 'count',
        target: 2,
        value: (s) => s.stats.bossKills
    },
    {
        id: 'any_evolve2',
        name: 'Up Only, Twice',
        text: 'Evolve 2 weapons or passives in one run.',
        art: 'laser_eyes',
        reward: 150,
        unit: 'count',
        target: 2,
        value: (s, run) => run.evolved
    },
    {
        id: 'any_win',
        name: 'Cycle Complete',
        text: 'Beat the final boss and end the bear market.',
        art: 'bear_market',
        reward: 400,
        unit: 'once',
        target: 1,
        value: (s) => (s.won ? 1 : 0)
    },
    // --- the Bull
    {
        id: 'bull_5min',
        name: 'Market Open',
        text: 'Survive 5:00 as the Bull.',
        art: 'horns',
        reward: 100,
        character: 'bull',
        unit: 'time',
        target: 300,
        value: time
    },
    {
        id: 'bull_1000',
        name: 'Stampede',
        text: 'Rekt 1,000 bears in one run as the Bull.',
        art: 'green_candle',
        reward: 250,
        character: 'bull',
        unit: 'count',
        target: 1000,
        value: (s) => s.stats.kills
    },
    {
        id: 'bull_10min',
        name: 'Raging Bull',
        text: 'Survive 10:00 as the Bull.',
        art: 'diamond_hands',
        reward: 250,
        character: 'bull',
        unit: 'time',
        target: 600,
        value: time
    },
    {
        id: 'bull_rug_clean',
        name: 'Clean Rug Pull',
        text: 'Take down the Rug Lord as the Bull without taking a hit in the fight.',
        art: 'rug_lord',
        reward: 300,
        character: 'bull',
        unit: 'once',
        target: 1,
        value: clean('rug_lord')
    },
    // --- Pepe
    {
        id: 'pepe_5min',
        name: 'Comfy',
        text: 'Survive 5:00 as Pepe.',
        art: 'tongue',
        reward: 100,
        character: 'pepe',
        unit: 'time',
        target: 300,
        value: time
    },
    {
        id: 'pepe_untouched',
        name: 'Untouchable Frog',
        text: 'Go 3:00 without taking a hit as Pepe.',
        art: 'thick_skin',
        reward: 200,
        character: 'pepe',
        unit: 'time',
        target: 180,
        value: (s, run) => run.streak
    },
    {
        id: 'pepe_capitulation',
        name: 'Ate the Capitulation',
        text: 'Take down Capitulation as Pepe.',
        art: 'capitulation',
        reward: 200,
        character: 'pepe',
        unit: 'once',
        target: 1,
        value: boss('capitulation')
    },
    {
        id: 'pepe_10min',
        name: 'Feels Good',
        text: 'Survive 10:00 as Pepe.',
        art: 'hopium',
        reward: 250,
        character: 'pepe',
        unit: 'time',
        target: 600,
        value: time
    },
    // --- the Whale
    {
        id: 'whale_sweep',
        name: 'Market Maker',
        text: 'Sweep 200 candles in one run as the Whale.',
        art: 'whale_gravity',
        reward: 150,
        character: 'whale',
        unit: 'count',
        target: 200,
        value: (s) => s.stats.swept
    },
    {
        id: 'whale_wall',
        name: 'Wall Street',
        text: 'Shove bears 1,000 times with the Buy Wall in one run.',
        art: 'buy_wall',
        reward: 150,
        character: 'whale',
        unit: 'count',
        target: 1000,
        value: (s) => s.stats.wallHits
    },
    {
        id: 'whale_liq',
        name: 'Too Big to Liquidate',
        text: 'Take down Liquidation as the Whale.',
        art: 'liquidation',
        reward: 250,
        character: 'whale',
        unit: 'once',
        target: 1,
        value: boss('liquidation')
    },
    {
        id: 'whale_12min',
        name: 'Deep Water',
        text: 'Survive 12:00 as the Whale.',
        art: 'whale_hero',
        reward: 300,
        character: 'whale',
        unit: 'time',
        target: 720,
        value: time
    },
    // --- the Miner
    {
        id: 'miner_5min',
        name: 'Proof of Work',
        text: 'Survive 5:00 as the Miner.',
        art: 'pickaxe',
        reward: 100,
        character: 'miner',
        unit: 'time',
        target: 300,
        value: time
    },
    {
        id: 'miner_blocks',
        name: 'Hash Rate',
        text: 'Mine 12 blocks in one run as the Miner.',
        art: 'block_reward',
        reward: 150,
        character: 'miner',
        unit: 'count',
        target: 12,
        value: (s) => s.stats.blocks
    },
    {
        id: 'miner_shields',
        name: 'Shield Breaker',
        text: 'Crack 60 grizzly shields in one run as the Miner.',
        art: 'diamond_pickaxe',
        reward: 200,
        character: 'miner',
        unit: 'count',
        target: 60,
        value: (s) => s.stats.shieldsBroken
    },
    {
        id: 'miner_10min',
        name: 'Halving Survivor',
        text: 'Survive 10:00 as the Miner.',
        art: 'miner_hero',
        reward: 300,
        character: 'miner',
        unit: 'time',
        target: 600,
        value: time
    },
    // --- the maps
    {
        id: 'chop_10min',
        name: 'Sideways Forever',
        text: 'Survive 10:00 on Chop Zone.',
        art: 'circuit_breaker',
        reward: 200,
        stage: 'chop',
        unit: 'time',
        target: 600,
        value: time
    },
    {
        id: 'chop_liq',
        name: 'Margin Closed',
        text: 'Take down Liquidation on Chop Zone.',
        art: 'liquidation',
        reward: 250,
        stage: 'chop',
        unit: 'once',
        target: 1,
        value: boss('liquidation')
    },
    {
        id: 'trap_rug',
        name: 'Sprung the Trap',
        text: 'Take down the Rug Lord on Bear Trap.',
        art: 'rug_lord',
        reward: 150,
        stage: 'bear_trap',
        unit: 'once',
        target: 1,
        value: boss('rug_lord')
    },
    {
        id: 'trap_8min',
        name: 'Doomscroll',
        text: 'Survive 8:00 on Bear Trap.',
        art: 'doomposter',
        scale: 2, // a small bear: twice the bosses' scale
        reward: 200,
        stage: 'bear_trap',
        unit: 'time',
        target: 480,
        value: time
    },
    {
        id: 'winter_freeze',
        name: 'Withdrawals Open',
        text: 'Take down Withdrawal Freeze on Crypto Winter.',
        art: 'withdrawal_freeze',
        reward: 150,
        stage: 'winter',
        unit: 'once',
        target: 1,
        value: boss('withdrawal_freeze')
    },
    {
        id: 'winter_long',
        name: 'Spring',
        text: 'Take down The Long Winter on Crypto Winter.',
        art: 'long_winter',
        reward: 300,
        stage: 'winter',
        unit: 'once',
        target: 1,
        value: boss('long_winter')
    },
    {
        id: 'eras_defi',
        name: 'DeFi Summer',
        text: 'Reach DeFi Summer on Market Eras.',
        art: 'yield_farm',
        reward: 100,
        stage: 'eras',
        unit: 'era',
        target: 1,
        value: (s) => s.eraIndex || 0
    },
    {
        id: 'eras_hack_clean',
        name: 'Not Your Keys',
        text: 'Take down The Hacked Exchange on Market Eras without taking a hit in the fight.',
        art: 'hacked_exchange',
        reward: 250,
        stage: 'eras',
        unit: 'once',
        target: 1,
        value: clean('hacked_exchange')
    },
    {
        id: 'eras_alt',
        name: 'Altseason',
        text: 'Reach Altcoin Season on Market Eras.',
        art: 'peak_euphoria',
        reward: 200,
        stage: 'eras',
        unit: 'era',
        target: 2,
        value: (s) => s.eraIndex || 0
    },
    {
        id: 'eras_bear',
        name: 'Full Cycle',
        text: 'Reach the Bear Market era on Market Eras.',
        art: 'bear_market',
        reward: 300,
        stage: 'eras',
        unit: 'era',
        target: 3,
        value: (s) => s.eraIndex || 0
    }
]);

export const MISSION_BY_ID = Object.freeze(Object.fromEntries(MISSIONS.map((m) => [m.id, m])));

/** The tab a mission is listed under. */
export function missionTab(m) {
    return m.character || (m.stage ? 'maps' : 'any');
}

/** Can a run on this character and map move the mission? */
export function missionApplies(m, character, stage) {
    return (!m.character || m.character === character) && (!m.stage || m.stage === stage);
}

/** Who and where, for a tag: "PEPE", "CRYPTO WINTER", or null for any run. */
export function missionScope(m) {
    if (m.character) return (CHARACTERS[m.character]?.name || m.character).replace(/^The /, '');
    if (m.stage) return getStage(m.stage)?.name || m.stage;
    return null;
}

export function defaultMissions() {
    return { done: {}, best: {}, unpaid: [] };
}

/** Any saved shape → a valid mission state. Unknown ids are dropped; unpaid ids must also be done. Never throws. */
export function normalizeMissions(raw) {
    const st = defaultMissions();
    if (!raw || typeof raw !== 'object') return st;
    for (const [id, day] of Object.entries(raw.done || {}))
        if (MISSION_BY_ID[id]) st.done[id] = typeof day === 'string' ? day.slice(0, 10) : '';
    for (const [id, v] of Object.entries(raw.best || {})) {
        const m = MISSION_BY_ID[id];
        if (m && Number.isFinite(v) && v > 0) st.best[id] = Math.min(v, m.target);
    }
    if (Array.isArray(raw.unpaid))
        st.unpaid = [...new Set(raw.unpaid)].filter((id) => MISSION_BY_ID[id] && id in st.done);
    return st;
}

/**
 * One run's mission watcher. `state`: the profile's missions (done ones never fire). Call `observe(sim, events)`
 * after each step with that step's events; it returns the missions that just completed. `best` is this run's
 * progress per mission (for the profile's best, kept when the run ends).
 */
export function createMissionTracker(state, character, stage) {
    const st = normalizeMissions(state);
    const active = MISSIONS.filter(
        (m) => !(m.id in st.done) && missionApplies(m, character, stage)
    );
    // fights: boss id -> the damage taken when it spawned, or false once the bull took a hit in that fight
    const run = {
        bosses: new Set(),
        clean: new Set(),
        fights: {},
        evolved: 0,
        hurt: 0,
        hitAt: 0,
        streak: 0
    };
    const best = {};
    return {
        run,
        best,
        active,
        observe(sim, events = []) {
            const hurt = sim.stats.damageTaken;
            if (hurt > run.hurt) {
                run.hurt = hurt;
                run.hitAt = sim.time;
                for (const id of Object.keys(run.fights)) run.fights[id] = false;
            }
            run.streak = Math.max(run.streak, sim.time - run.hitAt);
            for (const e of events) {
                if (e.t === 'evolve') run.evolved++;
                else if (e.t === 'boss') run.fights[e.id] = hurt;
                else if (e.t === 'bossDown') {
                    run.bosses.add(e.id);
                    if (run.fights[e.id] !== undefined && run.fights[e.id] !== false)
                        run.clean.add(e.id);
                    delete run.fights[e.id];
                }
            }
            const fresh = [];
            for (let i = active.length - 1; i >= 0; i--) {
                const m = active[i];
                const v = Math.min(m.value(sim, run), m.target);
                if (v > (best[m.id] || 0)) best[m.id] = v;
                if (v >= m.target) {
                    active.splice(i, 1);
                    fresh.unshift(m);
                }
            }
            return fresh;
        }
    };
}

/** Mark missions done (and owed) on `day`. Returns a new state; already-done ids are left alone. */
export function completeMissions(state, ids, day) {
    const st = normalizeMissions(state);
    for (const id of ids) {
        if (!MISSION_BY_ID[id] || id in st.done) continue;
        st.done[id] = day;
        st.unpaid.push(id);
        delete st.best[id];
    }
    return st;
}

/** Keep the better of the saved and this run's progress for every unfinished mission. */
export function mergeBest(state, best = {}) {
    const st = normalizeMissions(state);
    for (const [id, v] of Object.entries(best)) {
        const m = MISSION_BY_ID[id];
        if (!m || id in st.done || !Number.isFinite(v) || v <= 0) continue;
        st.best[id] = Math.min(m.target, Math.max(st.best[id] || 0, v));
    }
    return st;
}

/** Progress as words: "3:12 / 5:00", "212 / 500", "DeFi Summer", or '' for a one-off goal. */
export function missionProgress(m, v = 0) {
    const t = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
    const n = (x) => Math.floor(x).toLocaleString('en-US');
    if (m.unit === 'time') return `${t(v)} / ${t(m.target)}`;
    if (m.unit === 'count') return `${n(v)} / ${n(m.target)}`;
    if (m.unit === 'era') return `Best: ${ERA_NAMES[Math.floor(v)] || ERA_NAMES[0]}`;
    return '';
}

/** How far along a mission is, 0..1 (1 when done). */
export function missionRatio(state, m) {
    if (m.id in (state?.done || {})) return 1;
    return Math.max(0, Math.min(1, (state?.best?.[m.id] || 0) / m.target));
}

/**
 * The mission the start screen shows for a character: its own first unfinished one, else the first unfinished
 * one for any run, else null (all done).
 */
export function nextMission(state, character) {
    const st = normalizeMissions(state);
    const open = (m) => !(m.id in st.done);
    return (
        MISSIONS.find((m) => m.character === character && open(m)) ||
        MISSIONS.find((m) => !m.character && !m.stage && open(m)) ||
        null
    );
}

/** Done, total and the CLOUT still on the table. */
export function missionTotals(state) {
    const st = normalizeMissions(state);
    const done = MISSIONS.filter((m) => m.id in st.done);
    return {
        done: done.length,
        total: MISSIONS.length,
        left: MISSIONS.reduce((a, m) => a + (m.id in st.done ? 0 : m.reward), 0)
    };
}
