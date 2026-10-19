/**
 * The Daily Challenge twist, named with the code of the build the day is pinned to. `builds` maps a build
 * number to that build's own content.js (bundled by scripts/build.mjs into generated/twists.js). Builds before
 * twists existed return null.
 */
export function twistFor(builds, build, seed) {
    const mod = builds && builds[build];
    if (!mod || typeof mod.dailyTwistForSeed !== 'function') return null;
    const def = mod.TWISTS && mod.TWISTS[mod.dailyTwistForSeed(seed >>> 0)];
    return def ? { id: def.id, name: def.name, description: def.description } : null;
}

/**
 * The Daily Challenge map, from the same build's own content.js: the game picks it with `stageForSeed`, and a
 * build can add maps (Build #27 made it four), so a fixed list on the Worker would name the wrong one. Builds whose
 * content has no `stageForSeed` fall back to `fallback(seed)` (lib/daily.js).
 */
export function stageFor(builds, build, seed, fallback) {
    const mod = builds && builds[build];
    if (!mod || typeof mod.stageForSeed !== 'function') return fallback(seed >>> 0);
    return mod.stageForSeed(seed >>> 0);
}

/** A map's display name, from the build's own content.js when it has one. */
export function stageNameFor(builds, build, id, names = {}) {
    const mod = builds && builds[build];
    const def = mod && typeof mod.getStage === 'function' ? mod.getStage(id) : null;
    return def && def.id === id ? def.name : names[id] || id;
}
