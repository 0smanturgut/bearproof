/**
 * @module collection
 * @description The Collection: every weapon, evolution, passive, bear and boss a player has met, kept in the profile
 * (prefs.profile.seen) and shown on the Collection screen (guide.js marks what's still locked). It only watches a run
 * from outside, so it never touches the simulation, a replay or the Daily board. No DOM.
 */

import { BOSSES, ENEMIES, PASSIVES, WEAPONS } from './sim/content.js';

/** Every id that can be collected, per kind, in content order. An evolution is the id of what evolves. */
export const COLLECTION = Object.freeze({
    weapons: Object.values(WEAPONS).map((w) => w.id),
    evolutions: [
        ...Object.values(WEAPONS).filter((w) => w.evolveName),
        ...Object.values(PASSIVES).filter((p) => p.evolveName)
    ].map((d) => d.id),
    passives: Object.values(PASSIVES).map((p) => p.id),
    bears: Object.values(ENEMIES).map((e) => e.id),
    bosses: Object.values(BOSSES).map((b) => b.id)
});

export const COLLECTION_KINDS = Object.freeze(Object.keys(COLLECTION));

export function defaultSeen() {
    return Object.fromEntries(COLLECTION_KINDS.map((k) => [k, []]));
}

/** Any saved shape → valid lists of known ids, deduped, in content order. Never throws. */
export function normalizeSeen(raw) {
    const out = defaultSeen();
    if (!raw || typeof raw !== 'object') return out;
    for (const k of COLLECTION_KINDS) {
        const have = new Set(Array.isArray(raw[k]) ? raw[k] : []);
        out[k] = COLLECTION[k].filter((id) => have.has(id));
    }
    return out;
}

/** Union of two seen records. */
export function mergeSeen(a, b) {
    const x = normalizeSeen(a);
    const y = normalizeSeen(b);
    return normalizeSeen(Object.fromEntries(COLLECTION_KINDS.map((k) => [k, [...x[k], ...y[k]]])));
}

/** { found, total } overall, and per kind. */
export function collectionTotals(seen) {
    const s = normalizeSeen(seen);
    const kinds = Object.fromEntries(
        COLLECTION_KINDS.map((k) => [k, { found: s[k].length, total: COLLECTION[k].length }])
    );
    const found = COLLECTION_KINDS.reduce((a, k) => a + kinds[k].found, 0);
    const total = COLLECTION_KINDS.reduce((a, k) => a + kinds[k].total, 0);
    return { found, total, kinds };
}

/**
 * Watches a run: `observe(sim)` looks at what the bull holds and what's on the field, and returns what's new to the
 * Collection as [{ kind, id }] (each only once). `seen()` is the record so far, the saved one included.
 */
export function createCollector(saved) {
    const sets = Object.fromEntries(
        Object.entries(normalizeSeen(saved)).map(([k, ids]) => [k, new Set(ids)])
    );
    const known = Object.fromEntries(COLLECTION_KINDS.map((k) => [k, new Set(COLLECTION[k])]));
    const add = (fresh, kind, id) => {
        if (!known[kind].has(id) || sets[kind].has(id)) return;
        sets[kind].add(id);
        fresh.push({ kind, id });
    };
    return {
        observe(sim) {
            const fresh = [];
            const p = sim.player;
            for (const w of p.weapons) {
                add(fresh, 'weapons', w.id);
                if (w.isEvolved()) add(fresh, 'evolutions', w.id);
            }
            for (const id of p.passiveOrder) {
                add(fresh, 'passives', id);
                if (p.evolvedPassive?.(id)) add(fresh, 'evolutions', id);
            }
            for (const e of sim.enemies) {
                if (e.breakable || e.hp <= 0) continue;
                add(fresh, e.boss ? 'bosses' : 'bears', e.id);
            }
            return fresh;
        },
        seen() {
            return normalizeSeen(
                Object.fromEntries(COLLECTION_KINDS.map((k) => [k, [...sets[k]]]))
            );
        }
    };
}
