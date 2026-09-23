/** The build manifest, bundled into the Worker at deploy time (wrangler/esbuild resolves the JSON import). */
import manifest from '../../builds/builds.json';

export const BUILDS = manifest.builds;
