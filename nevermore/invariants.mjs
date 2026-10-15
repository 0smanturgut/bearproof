/**
 * @module nevermore/invariants
 * @description The invariant template library for a survivors-like game, plus expression-based custom invariants.
 * A template is `{ id, title, describe, params, needsPrev, needsLists, applies(snap, params), check(snap, prev,
 * params) }`; `check` returns null when the invariant holds and a short failure message when it doesn't.
 * `describe` is a plain declarative sentence (no instructions): the curator reuses it in lesson drafts.
 */

import { compile } from './expr.mjs';
import { nonFinitePaths } from './snapshot.mjs';

const EPS = 1e-9;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const fmt = (v) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v));

/** @type {Array<{id:string,title:string,describe:string,params:object,needsPrev?:boolean,needsLists?:boolean,applies?:Function,check:Function}>} */
export const TEMPLATES = [
    {
        id: 'hp-within-max',
        title: 'Player HP never exceeds max HP',
        describe:
            "The player's HP is never above the player's maximum HP, including right after any heal.",
        params: { epsilon: 1e-6 },
        check: (s, _p, o) =>
            fin(s.player.hp) &&
            fin(s.player.maxHp) &&
            s.player.hp > s.player.maxHp + (o.epsilon ?? 1e-6)
                ? `player.hp ${fmt(s.player.hp)} > player.maxHp ${fmt(s.player.maxHp)}`
                : null
    },
    {
        id: 'hp-finite',
        title: 'Player HP and max HP are finite numbers',
        describe:
            "The player's HP and maximum HP are always finite numbers, and the maximum is above zero.",
        params: {},
        check: (s) =>
            !fin(s.player.hp)
                ? `player.hp is ${fmt(s.player.hp)}`
                : !fin(s.player.maxHp) || s.player.maxHp <= 0
                  ? `player.maxHp is ${fmt(s.player.maxHp)}`
                  : null
    },
    {
        id: 'hp-non-negative',
        title: 'Player HP is never negative',
        describe: "The player's HP never drops below zero; a lethal hit leaves it at exactly zero.",
        params: {},
        check: (s) =>
            fin(s.player.hp) && s.player.hp < 0 ? `player.hp ${fmt(s.player.hp)} < 0` : null
    },
    {
        id: 'position-finite',
        title: 'Player position is finite',
        describe: "The player's x and y coordinates are always finite numbers.",
        params: {},
        check: (s) =>
            !fin(s.player.x) || !fin(s.player.y)
                ? `player position (${fmt(s.player.x)}, ${fmt(s.player.y)}) is not finite`
                : null
    },
    {
        id: 'position-continuous',
        title: 'Player never teleports',
        describe:
            'The player moves at most a bounded distance in one tick; there are no jumps across the map.',
        params: { maxStep: 30 },
        needsPrev: true,
        check: (s, p, o) => {
            if (!p || !fin(s.player.x) || !fin(p.player.x) || s.tick === p.tick) return null;
            const d = Math.hypot(s.player.x - p.player.x, s.player.y - p.player.y);
            return d > (o.maxStep ?? 30)
                ? `player moved ${fmt(d)} units in one tick (limit ${o.maxStep ?? 30})`
                : null;
        }
    },
    {
        id: 'player-inside-world',
        title: 'Player stays inside the world',
        describe: 'The player is always inside the world bounds (the arena walls).',
        params: {},
        applies: (s, o) =>
            !!(s.world || (fin(o.minX) && fin(o.maxX) && fin(o.minY) && fin(o.maxY))),
        check: (s, _p, o) => {
            const w = fin(o.minX) ? o : s.world;
            const { x, y } = s.player;
            if (!fin(x) || !fin(y)) return null; // position-finite reports this
            if (fin(w.r)) {
                const d = Math.hypot(x - (w.cx || 0), y - (w.cy || 0));
                return d > w.r + EPS
                    ? `player ${fmt(d)} from centre, world radius ${fmt(w.r)}`
                    : null;
            }
            return x < w.minX - EPS || x > w.maxX + EPS || y < w.minY - EPS || y > w.maxY + EPS
                ? `player (${fmt(x)}, ${fmt(y)}) outside [${fmt(w.minX)}..${fmt(w.maxX)}]x[${fmt(w.minY)}..${fmt(w.maxY)}]`
                : null;
        }
    },
    {
        id: 'score-non-decreasing',
        title: 'Score never goes down',
        describe: 'The score only ever rises or stays the same during a run.',
        params: {},
        needsPrev: true,
        check: (s, p) =>
            p && fin(s.stats.score) && fin(p.stats.score) && s.stats.score < p.stats.score - EPS
                ? `stats.score fell from ${fmt(p.stats.score)} to ${fmt(s.stats.score)}`
                : null
    },
    {
        id: 'kills-non-decreasing',
        title: 'Kill count never goes down',
        describe: 'The kill counter only ever rises or stays the same during a run.',
        params: {},
        needsPrev: true,
        check: (s, p) =>
            p && fin(s.stats.kills) && fin(p.stats.kills) && s.stats.kills < p.stats.kills
                ? `stats.kills fell from ${p.stats.kills} to ${s.stats.kills}`
                : null
    },
    {
        id: 'xp-non-negative',
        title: 'XP and level are sane',
        describe:
            "The player's XP is never negative, the level is at least 1, and the level never goes down.",
        params: {},
        check: (s, p) =>
            fin(s.player.exp) && s.player.exp < -EPS
                ? `player.exp ${fmt(s.player.exp)} < 0`
                : fin(s.player.level) && s.player.level < 1
                  ? `player.level ${s.player.level} < 1`
                  : p &&
                      fin(p.player.level) &&
                      fin(s.player.level) &&
                      s.player.level < p.player.level
                    ? `player.level fell from ${p.player.level} to ${s.player.level}`
                    : null
    },
    {
        id: 'stats-non-negative',
        title: 'No run statistic is negative',
        describe: 'Every run statistic (kills, damage, crates and the rest) is zero or more.',
        params: {},
        check: (s) => {
            for (const [k, v] of Object.entries(s.stats))
                if (fin(v) && v < -EPS) return `stats.${k} = ${fmt(v)} < 0`;
            return null;
        }
    },
    {
        id: 'no-nan-anywhere',
        title: 'No NaN or Infinity in the game state',
        describe: 'No number in the game state is ever NaN or infinite.',
        params: {},
        check: (s) => {
            const bad = nonFinitePaths(s, '', [], 5);
            return bad.length ? `non-finite: ${bad.join(', ')}` : null;
        }
    },
    {
        id: 'level-up-choices-valid',
        title: 'Level-up offers valid, distinct cards',
        describe:
            'A level-up offers exactly the usual number of cards, each a weapon, a passive or a heal, with no card offered twice.',
        params: { count: 3 },
        check: (s, _p, o) => {
            if (!s.choices) return null;
            const want = o.count ?? 3;
            if (s.choices.length !== want)
                return `level-up offered ${s.choices.length} cards, expected ${want}`;
            const seen = new Set();
            for (const c of s.choices) {
                if (!['weapon', 'passive', 'heal'].includes(c.kind))
                    return `card of unknown kind '${c.kind}'`;
                if (!c.id) return 'card without an id';
                if (c.kind === 'heal') continue;
                const key = `${c.kind}:${c.id}`;
                if (seen.has(key)) return `card ${key} offered twice`;
                seen.add(key);
            }
            return null;
        }
    },
    {
        id: 'time-monotonic',
        title: 'Simulation time moves forward one tick at a time',
        describe:
            'The tick counter never goes backwards or skips, and the clock always equals ticks divided by the tick rate.',
        params: {},
        check: (s, p) => {
            if (p && fin(p.tick) && fin(s.tick) && (s.tick < p.tick || s.tick > p.tick + 1))
                return `tick went from ${p.tick} to ${s.tick}`;
            const rate = s.limits?.tickRate;
            if (fin(rate) && fin(s.tick) && fin(s.time) && Math.abs(s.time - s.tick / rate) > 1e-6)
                return `time ${fmt(s.time)} != tick/${rate} (${fmt(s.tick / rate)})`;
            return null;
        }
    },
    {
        id: 'enemy-count-bounded',
        title: 'Enemy count stays bounded',
        describe: 'The number of enemies alive at once stays below a hard ceiling.',
        params: { max: 1000 },
        check: (s, _p, o) =>
            s.counts.enemies > (o.max ?? 1000)
                ? `${s.counts.enemies} enemies (limit ${o.max ?? 1000})`
                : null
    },
    {
        id: 'run-ends-when-hp-zero',
        title: 'The run ends when HP reaches zero',
        describe:
            'When the player reaches zero HP the run is over, and a run that ended by liquidation has the player at zero HP.',
        params: {},
        check: (s) => {
            if (fin(s.player.hp) && s.player.hp <= 0 && !s.over && !s.choices)
                return `player.hp ${fmt(s.player.hp)} but the run is not over`;
            if (s.over && s.endReason === 'liquidated' && fin(s.player.hp) && s.player.hp > 0)
                return `run ended 'liquidated' with player.hp ${fmt(s.player.hp)}`;
            return null;
        }
    },
    {
        id: 'won-implies-over',
        title: 'A won run is over',
        describe: 'A run is only ever marked won once it is over.',
        params: {},
        check: (s) =>
            s.won && s.over === false && s.tick > 0 ? 'won is true but the run is not over' : null
    },
    {
        id: 'loadout-within-limits',
        title: 'Weapon and passive slots stay within limits',
        describe: 'The player never holds more weapons or passives than the game allows.',
        params: {},
        check: (s) =>
            fin(s.limits?.maxWeapons) && s.player.weapons > s.limits.maxWeapons
                ? `${s.player.weapons} weapons (limit ${s.limits.maxWeapons})`
                : fin(s.limits?.maxPassives) && s.player.passives > s.limits.maxPassives
                  ? `${s.player.passives} passives (limit ${s.limits.maxPassives})`
                  : null
    },
    {
        id: 'enemy-hp-within-max',
        title: 'Enemy HP never exceeds its max',
        describe: "No enemy's HP is ever above its own maximum HP.",
        params: { epsilon: 1e-6 },
        needsLists: true,
        check: (s, _p, o) => {
            for (const e of s.enemies || [])
                if (fin(e.hp) && fin(e.maxHp) && e.hp > e.maxHp + (o.epsilon ?? 1e-6))
                    return `enemy ${e.id} hp ${fmt(e.hp)} > maxHp ${fmt(e.maxHp)}`;
            return null;
        }
    }
];

export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

/**
 * Build a checker from a spec's `invariant` block: `{ template, params?, every? }` or `{ expr, every? }`.
 * Returns `{ id, describe, needsPrev, needsLists, every, applies(snap), check(snap, prev) → null | message }`.
 */
export function makeChecker(inv) {
    const every = inv.every ?? 'tick';
    if (inv.template) {
        const t = TEMPLATE_BY_ID[inv.template];
        if (!t) throw new Error(`unknown invariant template '${inv.template}'`);
        const params = { ...t.params, ...(inv.params || {}) };
        return {
            id: t.id,
            describe: t.describe,
            needsPrev: !!t.needsPrev || t.id === 'xp-non-negative' || t.id === 'time-monotonic',
            needsLists: !!t.needsLists,
            every,
            applies: (s) => (t.applies ? t.applies(s, params) : true),
            check: (s, p) => t.check(s, p, params)
        };
    }
    if (typeof inv.expr === 'string') {
        const c = compile(inv.expr);
        const params = inv.params || {};
        return {
            id: 'expr',
            describe: `The expression \`${inv.expr}\` holds on every checked tick.`,
            needsPrev: c.usesPrev,
            needsLists: c.usesLists,
            every,
            applies: () => true,
            check: (s, p) => {
                // a `prev` invariant is not checked on the very first snapshot
                if (c.usesPrev && !p) return null;
                return c.test({ ...s, prev: p, params })
                    ? null
                    : `expression is false: ${inv.expr}`;
            }
        };
    }
    throw new Error('invariant needs a template or an expr');
}

/** Should the invariant be checked at this tick, for cadence `every` ('tick' | 'second' | 'end' | N ticks)? */
export function dueAt(every, tick, rate = 60) {
    if (every === 'tick') return true;
    if (every === 'end') return false;
    const step = every === 'second' ? rate : every;
    return Number.isInteger(step) && step > 0 ? tick % step === 0 : true;
}
