/**
 * The build manifest, bundled into the Worker at deploy time. `npm run build` (scripts/build.mjs) merges
 * builds/builds.json with the annotated `build-<n>` git tags and writes ./generated/builds.json.
 */
import manifest from './generated/builds.json' with { type: 'json' };

export const BUILDS = manifest.builds;
