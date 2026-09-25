/**
 * The Build Agent, live.
 *
 *   POST /api/internal/agent/events  { run, build, events: [{ ts, type, text, data? }] }   Bearer INGEST_TOKEN
 *   GET  /api/agent/live[?run=<id>]  the latest (or a given) agent run: status and its events, for /live
 *   POST /api/internal/agent/cost    { run, build, usd, detail? }   the run's measured compute, Bearer INGEST_TOKEN
 *
 * Events come from the GitHub Actions run (agent/live.mjs, agent/relay.mjs), which strips anything that looks
 * like a secret before it sends. Here they are length-capped and stored as plain text; the page renders them
 * with textContent, never as HTML.
 */

import { all, first } from '../lib/db.js';
import { error, json, readJson } from '../lib/http.js';
import { authorized } from './internal.js';

export const EVENT_TYPES = new Set([
    'start', // the run began
    'context', // what the agent was given: the vote, the numbers
    'say', // the agent's own words while it works
    'tool', // a file read or edited, a command run
    'test', // a test or gate result
    'plan', // the plan it wrote
    'review', // the second pass
    'gate', // guard, secret scan, gates
    'cost', // measured cost
    'ship', // PR opened, merged, build scheduled
    'done',
    'failed'
]);

const RUN = /^[0-9A-Za-z_-]{1,40}$/;

export async function postAgentEvents(request, env) {
    if (!authorized(request, env)) return error(401, 'unauthorized', 'Bearer token required.');
    const { data, error: bad } = await readJson(request, 64 * 1024);
    if (bad) return bad;
    const run = String(data?.run ?? '');
    if (!RUN.test(run)) return error(400, 'invalid_field', 'Bad run id.', { field: 'run' });
    const build = Number.isSafeInteger(data?.build) ? data.build : null;
    const events = Array.isArray(data?.events) ? data.events.slice(0, 60) : [];
    const rows = [];
    for (const e of events) {
        if (!EVENT_TYPES.has(e?.type)) continue;
        const text =
            typeof e.text === 'string' ? e.text.replace(/\s+/g, ' ').trim().slice(0, 400) : '';
        if (!text) continue;
        let extra = null;
        if (e.data && typeof e.data === 'object') {
            const s = JSON.stringify(e.data);
            if (s.length <= 1500) extra = s;
        }
        const ts = Number.isFinite(e.ts) ? Math.round(e.ts) : Date.now();
        rows.push(
            env.DB.prepare(
                'INSERT INTO agent_events (run_id, build, ts, type, text, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
            ).bind(run, build, ts, e.type, text, extra)
        );
    }
    if (!rows.length) return json({ ok: true, stored: 0 });
    try {
        await env.DB.batch(rows);
    } catch (err) {
        console.warn('[agent events]', err?.message || err);
        return error(503, 'db_unavailable', 'Storage is unavailable.');
    }
    return json({ ok: true, stored: rows.length });
}

export async function agentLive(request, env) {
    const q = new URL(request.url).searchParams.get('run');
    let run = q && RUN.test(q) ? q : null;
    if (!run) {
        const last = await first(env, 'SELECT run_id FROM agent_events ORDER BY id DESC LIMIT 1');
        run = last?.run_id || null;
    }
    if (!run) return json({ run: null, status: 'none', events: [] }, { maxAge: 5 });
    const rows =
        (await all(
            env,
            `SELECT id, build, ts, type, text, data FROM (
                SELECT * FROM agent_events WHERE run_id = ? ORDER BY id DESC LIMIT 400
             ) ORDER BY id`,
            run
        )) || [];
    const last = rows.at(-1);
    const ended = rows.find((r) => r.type === 'done' || r.type === 'failed');
    const status = ended
        ? ended.type
        : last && Date.now() - last.ts > 30 * 60000
          ? 'stalled'
          : 'running';
    return json(
        {
            run,
            build: rows.find((r) => r.build !== null)?.build ?? null,
            status,
            startedAt: rows[0] ? new Date(rows[0].ts).toISOString() : null,
            updatedAt: last ? new Date(last.ts).toISOString() : null,
            events: rows.map((r) => ({
                id: r.id,
                ts: new Date(r.ts).toISOString(),
                type: r.type,
                text: r.text,
                data: r.data ? safeParse(r.data) : null
            }))
        },
        { maxAge: 3 }
    );
}

function safeParse(s) {
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
}

/**
 * POST /api/internal/agent/cost { run, build, usd, detail? }   Bearer INGEST_TOKEN
 * The measured Claude cost of one Build Agent run (Claude Code's own count, both passes), shipped or not. It is
 * what "Spent on compute" on the HQ adds up. One row per GitHub run; a repeat overwrites it.
 */
export async function postComputeCost(request, env) {
    if (!authorized(request, env)) return error(401, 'unauthorized', 'Bearer token required.');
    const { data, error: bad } = await readJson(request, 4096);
    if (bad) return bad;
    const run = String(data?.run ?? '');
    if (!RUN.test(run)) return error(400, 'invalid_field', 'Bad run id.', { field: 'run' });
    const usd = Number(data?.usd);
    if (!Number.isFinite(usd) || usd < 0 || usd > 500)
        return error(400, 'invalid_field', 'Bad usd.', { field: 'usd' });
    const build = Number.isSafeInteger(data?.build) ? data.build : null;
    const detail = typeof data?.detail === 'string' ? data.detail.slice(0, 300) : null;
    await env.DB.prepare(
        `INSERT INTO compute_costs (id, build, ts, provider, usd, measured, detail)
         VALUES (?1, ?2, ?3, 'anthropic', ?4, 1, ?5)
         ON CONFLICT(id) DO UPDATE SET usd = excluded.usd, build = excluded.build, detail = excluded.detail`
    )
        .bind(`gh-${run}`, build, Date.now(), usd, detail)
        .run();
    return json({ ok: true });
}
