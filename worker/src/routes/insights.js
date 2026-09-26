/**
 * GET /api/insights[?build=N][&hours=24]: what verified runs say about a build (default: the live one, last 24 h).
 * Numbers and content ids only. The Build Agent reads it before it picks a feature; the HQ shows it.
 */

import { BUILDS } from '../manifest.js';
import { liveBuild } from '../lib/builds.js';
import { all, buildOverride } from '../lib/db.js';
import { error, json } from '../lib/http.js';
import { foldInsights } from '../lib/insights.js';

export async function insights(request, env) {
    const params = new URL(request.url).searchParams;
    const now = Date.now();
    const hours = Math.min(24 * 14, Math.max(1, Number(params.get('hours')) || 24));
    let build = params.has('build') ? Number(params.get('build')) : null;
    if (build === null || !Number.isSafeInteger(build))
        build = liveBuild(BUILDS, now, await buildOverride(env))?.n ?? null;
    if (build === null) return error(503, 'no_build', 'No build is live yet.');
    const from = now - hours * 3600000;
    const rows = await all(
        env,
        `SELECT player_id, stats FROM runs
          WHERE build = ?1 AND status = 'verified' AND stats IS NOT NULL AND created_at >= ?2
          ORDER BY created_at DESC LIMIT 2000`,
        build,
        from
    );
    if (!rows) return error(503, 'db_unavailable', 'Storage is unavailable.');
    // How the server's replays went for this build in the window: a jump in rejected runs can mean a determinism
    // regression (or someone trying a modified client).
    const counts =
        (await all(
            env,
            'SELECT status, COUNT(*) AS n FROM runs WHERE build = ?1 AND created_at >= ?2 GROUP BY status',
            build,
            from
        )) || [];
    const replays = { verified: 0, rejected: 0, pending: 0, unverifiable: 0 };
    for (const c of counts) if (c.status in replays) replays[c.status] = c.n;
    return json(
        {
            build,
            window: { hours, from: new Date(from).toISOString(), to: new Date(now).toISOString() },
            replays,
            ...foldInsights(rows),
            note: 'From verified runs only, re-played on the server. Ids are content ids (game/src/sim/content.js).'
        },
        { maxAge: 60 }
    );
}
