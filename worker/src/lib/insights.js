/**
 * Player insights (pure, unit-tested): what verified runs say about the live build. The verifier re-plays each
 * run and stores a small stats object; this folds a set of them into numbers the Build Agent and the HQ read.
 * Only ids and numbers: nothing a player typed.
 */

const median = (xs) => {
    if (!xs.length) return null;
    const s = xs.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (xs, p) => {
    if (!xs.length) return null;
    const s = xs.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const top = (counts, n, total) =>
    [...counts]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, n)
        .map(([id, c]) => ({
            id,
            runs: c,
            share: total ? Math.round((c / total) * 1000) / 10 : 0
        }));

/** Validate and trim one stats object from the verifier. Returns null when it isn't one. */
export function cleanStats(s) {
    if (!s || typeof s !== 'object') return null;
    const id = (v) => (typeof v === 'string' && /^[a-z0-9_]{1,40}$/.test(v) ? v : null);
    const n = (v) => (Number.isFinite(v) && v >= 0 && v < 1e12 ? Math.round(v) : null);
    const pairs = (a) =>
        Array.isArray(a)
            ? a
                  .slice(0, 24)
                  .map((x) => [id(x?.[0]), n(x?.[1])])
                  .filter((x) => x[0] && x[1] !== null)
            : [];
    const t = n(s.t);
    if (t === null) return null;
    return {
        t,
        lvl: n(s.lvl),
        k: n(s.k),
        s: n(s.s),
        bk: n(s.bk) ?? 0,
        won: !!s.won,
        reason: id(s.reason),
        diedTo: id(s.diedTo),
        boss: !!s.boss,
        w: pairs(s.w),
        p: pairs(s.p)
    };
}

/** Fold stats rows ({player_id, stats}) into insights. */
export function foldInsights(rows) {
    const runs = [];
    const players = new Set();
    for (const r of rows) {
        const s = cleanStats(typeof r.stats === 'string' ? safeParse(r.stats) : r.stats);
        if (!s) continue;
        runs.push(s);
        players.add(r.player_id);
    }
    const n = runs.length;
    const died = new Map();
    const weapons = new Map();
    const passives = new Map();
    for (const s of runs) {
        if (!s.won && s.diedTo) died.set(s.diedTo, (died.get(s.diedTo) || 0) + 1);
        for (const [w] of s.w) weapons.set(w, (weapons.get(w) || 0) + 1);
        for (const [p] of s.p) passives.set(p, (passives.get(p) || 0) + 1);
    }
    const secs = runs.map((s) => s.t / 1000);
    const deaths = runs.filter((s) => !s.won && s.diedTo).length;
    return {
        runs: n,
        players: players.size,
        survivalSec: {
            median: median(secs),
            p75: pct(secs, 75),
            best: n ? Math.max(...secs) : null
        },
        level: { median: median(runs.map((s) => s.lvl).filter((x) => x !== null)) },
        score: { median: median(runs.map((s) => s.s).filter((x) => x !== null)) },
        wins: runs.filter((s) => s.won).length,
        bossKillsPerRun: n
            ? Math.round((runs.reduce((a, s) => a + s.bk, 0) / n) * 100) / 100
            : null,
        diedTo: top(died, 6, deaths),
        weapons: top(weapons, 10, n),
        passives: top(passives, 10, n)
    };
}

function safeParse(s) {
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
}
