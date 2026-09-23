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
