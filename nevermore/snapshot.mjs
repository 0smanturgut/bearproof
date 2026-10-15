/**
 * @module nevermore/snapshot
 * @description A whitelisted, plain-data snapshot of a BEARPROOF `Simulation`. Invariants only ever see this, never
 * the live objects, so an invariant cannot call into the game or depend on internals that change every night.
 * Every field is read defensively: a build that lacks a field gives `null` (or 0 for counts), never a throw.
 *
 * Shape (version 1):
 *   { v, tick, time, over, won, endReason, picks, pendingLevelUps, choices: null | [{kind, id, level}],
 *     player: { x, y, hp, maxHp, baseMaxHp, level, exp, expToNext, dead, speedMult, invincible, shield, rocket,
 *               weapons, passives },
 *     counts: { enemies, bosses, projectiles, enemyProjectiles, mines, xp, crates },
 *     boss, stats: { kills, score, … every numeric stat }, world: null | { minX, maxX, minY, maxY } | { cx, cy, r },
 *     limits: { maxEnemies, maxTicks, tickRate, maxWeapons, maxPassives },
 *     enemies?: [{ x, y, hp, maxHp, boss, id }], orbs?: [{ x, y, value }] }   ← only with { lists: true }
 */

export const SNAPSHOT_VERSION = 1;

const n = (v) => (typeof v === 'number' ? v : null);
const b = (v) => (typeof v === 'boolean' ? v : v == null ? null : !!v);
const s = (v) => (typeof v === 'string' ? v.slice(0, 64) : null);
const len = (v) => (Array.isArray(v) ? v.length : 0);

function call(obj, name) {
    try {
        return obj && typeof obj[name] === 'function' ? n(obj[name]()) : null;
    } catch {
        return null;
    }
}

/** World bounds, if this build has any. BEARPROOF builds up to 23 are an endless plane (null). */
function worldOf(sim, content) {
    const w = sim.world || sim.bounds || sim.arena || content?.SIM?.WORLD || null;
    if (!w || typeof w !== 'object') return null;
    if (typeof w.r === 'number' || typeof w.radius === 'number')
        return { cx: n(w.cx ?? w.x) ?? 0, cy: n(w.cy ?? w.y) ?? 0, r: n(w.r ?? w.radius) };
    if (typeof w.minX === 'number')
        return { minX: w.minX, maxX: n(w.maxX), minY: n(w.minY), maxY: n(w.maxY) };
    if (typeof w.w === 'number' || typeof w.width === 'number') {
        const x = n(w.x) ?? 0;
        const y = n(w.y) ?? 0;
        return {
            minX: x,
            maxX: x + (n(w.w) ?? n(w.width)),
            minY: y,
            maxY: y + (n(w.h) ?? n(w.height))
        };
    }
    return null;
}

/**
 * @param {any} sim a Simulation of any build
 * @param {{ lists?: boolean, content?: any }} [opts] `lists`: include per-enemy and per-orb data (slower);
 *   `content`: the build's content module, for its limits
 */
export function snapshot(sim, { lists = false, content = null } = {}) {
    const p = sim.player || {};
    const enemies = Array.isArray(sim.enemies) ? sim.enemies : [];
    let bosses = 0;
    for (const e of enemies) if (e && e.boss && !(e.hp <= 0)) bosses++;
    const stats = {};
    if (sim.stats && typeof sim.stats === 'object')
        for (const [k, v] of Object.entries(sim.stats)) if (typeof v === 'number') stats[k] = v;
    const SIM = content?.SIM || {};
    const out = {
        v: SNAPSHOT_VERSION,
        tick: n(sim.tick),
        time: n(sim.time),
        over: b(sim.over),
        won: b(sim.won),
        endReason: s(sim.endReason),
        picks: n(sim.picks),
        pendingLevelUps: n(sim.pendingLevelUps),
        choices: Array.isArray(sim.choices)
            ? sim.choices.map((c) => ({ kind: s(c?.kind), id: s(c?.id), level: n(c?.level) }))
            : null,
        player: {
            x: n(p.x),
            y: n(p.y),
            hp: n(p.hp),
            maxHp: n(p.maxHp),
            baseMaxHp: n(p.baseMaxHp),
            level: n(p.level),
            exp: n(p.exp),
            expToNext: n(p.expToNext),
            dead: b(p.dead),
            speedMult: call(p, 'getSpeedMult'),
            invincible: n(p.invincibleTimer),
            shield: n(p.shieldTimer),
            rocket: n(p.rocketTimer),
            weapons: len(p.weapons),
            passives: len(p.passiveOrder)
        },
        counts: {
            enemies: enemies.length,
            bosses,
            projectiles: len(sim.projectiles),
            enemyProjectiles: len(sim.enemyProjectiles),
            mines: len(sim.mines),
            xp: len(sim.xp),
            crates: len(sim.crates)
        },
        boss: bosses > 0,
        stats,
        world: worldOf(sim, content),
        limits: {
            maxEnemies: n(SIM.MAX_ENEMIES),
            maxTicks: n(SIM.MAX_TICKS),
            tickRate: n(SIM.TICK_RATE),
            maxWeapons: n(SIM.MAX_WEAPONS),
            maxPassives: n(SIM.MAX_PASSIVES)
        }
    };
    if (lists) {
        out.enemies = enemies.map((e) => ({
            x: n(e.x),
            y: n(e.y),
            hp: n(e.hp),
            maxHp: n(e.maxHp),
            boss: !!e.boss,
            id: s(e.id)
        }));
        out.orbs = (Array.isArray(sim.xp) ? sim.xp : []).map((o) => ({
            x: n(o.x),
            y: n(o.y),
            value: n(o.value)
        }));
    }
    return out;
}

/** Every path in a snapshot whose number is NaN or ±Infinity (empty when clean). */
export function nonFinitePaths(snap, prefix = '', out = [], limit = 20) {
    if (out.length >= limit) return out;
    if (typeof snap === 'number') {
        if (!Number.isFinite(snap)) out.push(prefix || '(root)');
        return out;
    }
    if (snap && typeof snap === 'object') {
        if (Array.isArray(snap))
            snap.forEach((v, i) => nonFinitePaths(v, `${prefix}[${i}]`, out, limit));
        else
            for (const [k, v] of Object.entries(snap))
                nonFinitePaths(v, prefix ? `${prefix}.${k}` : k, out, limit);
    }
    return out;
}
