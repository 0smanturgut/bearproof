/**
 * Build selection. Pure functions over the manifest in builds/builds.json so they are unit-testable in Node.
 *
 * A build is live from its `activatesAt` until the next build activates. `revoked: true` removes a build
 * from rotation without deleting it (its files stay reachable under /b/<n>/ for replays).
 */

/** @typedef {{n:number, ref:string, commit:string, title:string, mode:string, activatesAt:string, revoked?:boolean, costUsd?:number|null}} Build */

/** Builds sorted by activation time, revoked ones removed. */
export function activeBuilds(builds) {
    return builds
        .filter((b) => !b.revoked)
        .slice()
        .sort((a, b) => Date.parse(a.activatesAt) - Date.parse(b.activatesAt) || a.n - b.n);
}

/**
 * The build that is live at `nowMs`. `overrideN` (from the CONFIG KV `build_override` key) wins when it
 * names an existing build. That is the one-command revert.
 * @returns {Build|null}
 */
export function liveBuild(builds, nowMs, overrideN = null) {
    if (overrideN !== null && overrideN !== undefined && overrideN !== '') {
        const forced = builds.find((b) => b.n === Number(overrideN));
        if (forced) return forced;
    }
    let live = null;
    for (const b of activeBuilds(builds)) {
        if (Date.parse(b.activatesAt) <= nowMs) live = b;
    }
    return live;
}

/** The build a daily challenge is pinned to: whatever was live at 00:00:00 UTC on that date. */
export function buildForDate(builds, dateStr, overrideN = null) {
    const midnight = Date.parse(`${dateStr}T00:00:00Z`);
    if (!Number.isFinite(midnight)) return null;
    return liveBuild(builds, midnight, overrideN) || liveBuild(builds, Date.now(), overrideN);
}

/** Builds the AI shipped (Build #0 is the untouched upstream baseline, so it doesn't count). */
export function shippedCount(builds, nowMs) {
    return activeBuilds(builds).filter((b) => b.n >= 1 && Date.parse(b.activatesAt) <= nowMs)
        .length;
}

/** Public, trimmed view of a build for the API. */
export function publicBuild(b) {
    if (!b) return null;
    return {
        n: b.n,
        title: b.title,
        mode: b.mode,
        commit: b.commit,
        ref: b.ref,
        activatesAt: b.activatesAt,
        costUsd: b.costUsd ?? null,
        revoked: !!b.revoked,
        path: `/b/${b.n}/`
    };
}
