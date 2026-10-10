/**
 * @module achievements
 * @description Badges (Build #19): themed goals that unlock mid-run and stay on this device. They only read the
 * simulation's state and events after each step, so they never change a run, a replay or the Daily board.
 * No DOM: game.js shows the toasts, main.js adds the guide tab.
 */

import { SIM } from './sim/content.js';

/** HP below this share of max starts the "-50% Day" clock; HOLD_SEC later it pays out if the bull still stands. */
const HALF = 0.5;
const HOLD_SEC = 120;

/**
 * Append-only by habit: the id is what a device stores. `art` is an icon or sprite id; `scale` is the guide's paint
 * scale (bosses are big). `check(sim, run)` runs after every step; `run` holds what this run has seen so far.
 */
export const ACHIEVEMENTS = [
    {
        id: 'opening_bell',
        name: 'Clean Open',
        text: 'Get through the first 3:00 without taking a hit.',
        art: 'thick_skin',
        check: (s) => s.time >= 180 && s.stats.damageTaken === 0
    },
    {
        id: 'hundred_bagger',
        name: 'Hundred-Bagger',
        text: 'Rekt 100 bears in one run.',
        art: 'red_candle',
        check: (s) => s.stats.kills >= 100
    },
    {
        id: 'up_only',
        name: 'Up Only',
        text: 'Evolve a weapon or a passive.',
        art: 'laser_eyes',
        check: (s, run) => run.evolved
    },
    {
        id: 'minus_50',
        name: '-50% Day',
        text: 'Drop below half HP, then hold on for 2 more minutes.',
        art: 'conviction',
        check: (s, run) => run.halfAt !== null && s.time - run.halfAt >= HOLD_SEC && !s.player.dead
    },
    {
        id: 'bought_the_dip',
        name: 'Bought the Dip',
        text: 'Win back 40 HP in Buy the Dip windows in one run.',
        art: 'buyback',
        check: (s) => s.stats.dipHealed >= 40
    },
    {
        id: 'bear_repellent',
        name: 'Bear Repellent',
        text: 'Break 10 grizzly shields in one run.',
        art: 'bear_spray',
        check: (s) => s.stats.shieldsBroken >= 10
    },
    {
        id: 'full_port',
        name: 'Full Port',
        text: `Fill every slot: ${SIM.MAX_WEAPONS} weapons and ${SIM.MAX_PASSIVES} passives.`,
        art: 'airdrop',
        check: (s) =>
            s.player.weapons.length >= SIM.MAX_WEAPONS &&
            s.player.passiveOrder.length >= SIM.MAX_PASSIVES
    },
    {
        id: 'bag_recovered',
        name: 'Bag Recovered',
        text: 'Catch an Exit Scam with your candles in its bag.',
        art: 'exit_scam',
        check: (s) => s.stats.scamsBusted >= 1
    },
    {
        id: 'rugged_the_rugger',
        name: 'Rugged the Rugger',
        text: 'Take down the Rug Lord.',
        art: 'rug_lord',
        scale: 1,
        check: (s, run) => run.bosses.has('rug_lord')
    },
    {
        id: 'liquidator',
        name: 'Liquidator',
        text: 'Land 100 Liquidation Risk chain hits in one run.',
        art: 'leverage',
        check: (s) => s.stats.liquidations >= 100
    },
    {
        id: 'diamond_hands',
        name: 'Diamond Hands',
        text: 'Survive to 10:00.',
        art: 'diamond_hands',
        check: (s) => s.time >= 600
    },
    {
        id: 'thousand_bagger',
        name: 'Thousand-Bagger',
        text: 'Rekt 1,000 bears in one run.',
        art: 'green_candle',
        check: (s) => s.stats.kills >= 1000
    },
    {
        id: 'survived_winter',
        name: 'Survived the Winter',
        text: 'Survive to 10:00 on a Crypto Winter stage.',
        art: 'long_winter',
        scale: 1,
        check: (s) => s.stageId === 'winter' && s.time >= 600
    },
    {
        id: 'bear_market_over',
        name: 'Bear Market Over',
        text: 'Beat the final boss and win a run.',
        art: 'horns',
        check: (s) => s.won
    }
];

/**
 * One run's badge watcher. `have`: ids already unlocked on this device (an object or an array); those never fire.
 * Call `observe(sim, events)` after each step with that step's events; it returns the badges that just unlocked.
 */
export function createTracker(have = {}) {
    const got = new Set(Array.isArray(have) ? have : Object.keys(have || {}));
    const run = { halfAt: null, evolved: false, bosses: new Set() };
    return {
        run,
        observe(sim, events = []) {
            for (const e of events) {
                if (e.t === 'evolve') run.evolved = true;
                else if (e.t === 'bossDown') run.bosses.add(e.id);
            }
            const p = sim.player;
            if (run.halfAt === null && !p.dead && p.hp < p.maxHp * HALF) run.halfAt = sim.time;
            const fresh = [];
            for (const a of ACHIEVEMENTS) {
                if (got.has(a.id) || !a.check(sim, run)) continue;
                got.add(a.id);
                fresh.push(a);
            }
            return fresh;
        }
    };
}

/** The Field Guide's Badges tab. `have`: { id: unlocked date } from prefs. */
export function badgeSection(have = {}) {
    const n = ACHIEVEMENTS.filter((a) => have[a.id]).length;
    return {
        id: 'badges',
        label: 'Badges',
        intro: `${n} of ${ACHIEVEMENTS.length} unlocked on this device. Any run counts, free or Daily.`,
        entries: ACHIEVEMENTS.map((a) => ({
            id: a.id,
            name: a.name,
            art: a.art,
            scale: a.scale,
            tags: [have[a.id] ? `Unlocked ${have[a.id]}` : 'Locked'],
            text: a.text,
            stats: '',
            extra: null,
            locked: !have[a.id]
        }))
    };
}
