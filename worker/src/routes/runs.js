/**
 * Play sessions, run submission and leaderboards.
 *
 * Boards rank claimed scores (best non-rejected run per player) and show each run's verification status.
 * Only `verified` runs can win prizes. That decision belongs to the verifier, not to this file.
 */

import { BUILDS } from '../manifest.js';
import { all, first, getOrCreateDaily } from '../lib/db.js';
import { isDateKey, utcDate } from '../lib/daily.js';
import { clientIp, ipKey, underLimit, verifyTurnstile } from '../lib/guard.js';
import { error, json, readJson } from '../lib/http.js';
import { MAX_BODY_BYTES, RUN_ID, displayName, isUuidV4, newId, validateRun } from '../lib/runs.js';

const BOARD_SIZE = 50;

/**
 * Best non-rejected run per player, scoped by `col` (a constant: 'challenge_date' or 'build').
 * Column order mirrors the runs_*_board covering indexes (migration 0002).
 */
const bestPerPlayer = (col) => `
    SELECT id, player_id, claimed_score, claimed_time_ms, claimed_level, claimed_kills, status, build,
        created_at,
        ROW_NUMBER() OVER (
            PARTITION BY player_id
            ORDER BY claimed_score DESC, claimed_time_ms DESC, created_at ASC
        ) AS pr
    FROM runs
    WHERE ${col} = ?1 AND status != 'rejected'`;

const ORDER = 'claimed_score DESC, claimed_time_ms DESC, created_at ASC';

const boardSql = (col) => `
    WITH best AS (${bestPerPlayer(col)}),
    top AS (
        SELECT *, COUNT(*) OVER () AS total FROM best WHERE pr = 1 ORDER BY ${ORDER} LIMIT ${BOARD_SIZE}
    )
    SELECT top.*, players.name FROM top LEFT JOIN players ON players.id = top.player_id
    ORDER BY ${ORDER}`;

const RANK_SQL = `
    WITH best AS (${bestPerPlayer('challenge_date')}),
    ranked AS (SELECT player_id, ROW_NUMBER() OVER (ORDER BY ${ORDER}) AS rank FROM best WHERE pr = 1)
    SELECT rank FROM ranked WHERE player_id = ?2`;

const UPSERT_PLAYER = `
    INSERT INTO players (id, name, created_at, last_seen_at) VALUES (?1, ?2, ?3, ?3)
    ON CONFLICT (id) DO UPDATE SET
        name = COALESCE(excluded.name, players.name), last_seen_at = excluded.last_seen_at`;

const tooMany = () => error(429, 'rate_limited', 'Too many requests. Try again in a minute.');
const dbDown = () => error(503, 'db_unavailable', 'Storage is unavailable. Try again shortly.');

/** POST /api/session: one row per (UTC day, browser). Powers the "players today" number. */
export async function session(request, env) {
    const { data, error: bad } = await readJson(request, 2048);
    if (bad) return bad;
    if (!isUuidV4(data?.playerId))
        return error(400, 'invalid_field', '`playerId` must be a UUID v4.', { field: 'playerId' });
    if (!BUILDS.some((b) => b.n === data.build))
        return error(400, 'unknown_build', `Build ${data.build} does not exist.`, {
            field: 'build'
        });
    if (data.mode !== 'daily' && data.mode !== 'free')
        return error(400, 'invalid_field', "`mode` must be 'daily' or 'free'.", { field: 'mode' });

    const playerId = data.playerId.toLowerCase();
    const ip = await ipKey(clientIp(request));
    if (!(await underLimit(env.RL_READ, `s:${playerId}`, `sip:${ip}`))) return tooMany();

    const now = Date.now();
    try {
        await env.DB.batch([
            env.DB.prepare(UPSERT_PLAYER).bind(playerId, null, now),
            env.DB.prepare(
                `INSERT INTO play_sessions (date, player_id, build, first_at, runs) VALUES (?1, ?2, ?3, ?4, 1)
                ON CONFLICT (date, player_id) DO UPDATE SET runs = runs + 1`
            ).bind(utcDate(now), playerId, data.build, now)
        ]);
    } catch (err) {
        console.warn('[session]', err?.message || err);
        return dbDown();
    }
    return json({ ok: true });
}

/** POST /api/runs: store a claimed run as `pending` for the replay verifier. */
export async function submitRun(request, env) {
    const now = Date.now();
    const { data, error: bad } = await readJson(request, MAX_BODY_BYTES);
    if (bad) return bad;
    const v = validateRun(data, { builds: BUILDS, nowMs: now });
    if (!v.ok) return error(v.status, v.code, v.message, v.field ? { field: v.field } : {});
    const run = v.run;

    const ip = clientIp(request);
    if (!(await underLimit(env.RL_SUBMIT, `p:${run.playerId}`, `ip:${await ipKey(ip)}`)))
        return tooMany();

    const botCheck = await verifyTurnstile(env, run.turnstileToken, ip);
    if (botCheck === 'failed')
        return error(403, 'bot_check_failed', 'Bot check failed. Reload and retry.');
    if (botCheck === 'unavailable')
        return error(503, 'bot_check_unavailable', 'Bot check is unreachable. Try again shortly.');

    if (run.mode === 'daily') {
        const daily = await getOrCreateDaily(env, run.challengeDate, BUILDS);
        if (daily.error) return daily.error;
        if (daily.row.seed !== run.seed || daily.row.build !== run.build)
            return error(
                409,
                'challenge_mismatch',
                `Seed or build does not match the ${run.challengeDate} challenge (build ${daily.row.build}).`
            );
    }

    const id = newId(now);
    try {
        await env.DB.batch([
            env.DB.prepare(UPSERT_PLAYER).bind(run.playerId, run.name, now),
            env.DB.prepare(
                `INSERT INTO runs (id, player_id, mode, challenge_date, build, seed, stage, claimed_score,
                    claimed_time_ms, claimed_kills, claimed_level, duration_ms, input_log, input_log_bytes,
                    status, bot_check, created_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'pending', ?15, ?16)`
            ).bind(
                id,
                run.playerId,
                run.mode,
                run.challengeDate,
                run.build,
                run.seed,
                run.stage,
                run.score,
                run.timeMs,
                run.kills,
                run.level,
                run.durationMs,
                run.log,
                run.log.length,
                botCheck,
                now
            )
        ]);
    } catch (err) {
        console.warn('[runs] insert failed', err?.message || err);
        return dbDown();
    }

    let rank = null;
    if (run.mode === 'daily') {
        rank = (await first(env, RANK_SQL, run.challengeDate, run.playerId))?.rank ?? null;
    }
    return json({ ok: true, id, status: 'pending', rank });
}

/** GET /api/leaderboard?date=YYYY-MM-DD (daily, default today) or ?build=N (all-time for a build). */
export async function leaderboard(request, env) {
    const params = new URL(request.url).searchParams;
    let col, key, meta;
    if (params.has('build')) {
        const n = /^\d{1,6}$/.test(params.get('build')) ? Number(params.get('build')) : NaN;
        if (!BUILDS.some((b) => b.n === n))
            return error(400, 'unknown_build', 'No such build.', { field: 'build' });
        [col, key, meta] = ['build', n, { board: 'build', date: null, build: n }];
    } else {
        const date = params.get('date') ?? utcDate(Date.now());
        if (!isDateKey(date))
            return error(400, 'invalid_field', '`date` must be YYYY-MM-DD.', { field: 'date' });
        const pinned = await first(env, 'SELECT build FROM daily_challenges WHERE date = ?', date);
        [col, key, meta] = [
            'challenge_date',
            date,
            { board: 'daily', date, build: pinned?.build ?? null }
        ];
    }

    const rows = await all(env, boardSql(col), key);
    if (!rows) return dbDown();
    return json(
        {
            ...meta,
            total: rows[0]?.total ?? 0,
            rows: rows.map((r, i) => ({
                rank: i + 1,
                name: displayName(r.name, r.player_id),
                score: r.claimed_score,
                timeMs: r.claimed_time_ms,
                level: r.claimed_level,
                kills: r.claimed_kills,
                status: r.status,
                build: r.build,
                runId: r.id
            })),
            generatedAt: new Date().toISOString()
        },
        { maxAge: 15 }
    );
}

/** GET /api/run/:id: public view of one run. No input log, no player id. */
/** Public view of one run: undefined = no such run, null = storage down. */
export async function loadRun(id, env) {
    if (!RUN_ID.test(id)) return undefined;
    const rows = await all(
        env,
        `SELECT runs.id, runs.player_id, runs.mode, runs.challenge_date, runs.build, runs.stage,
            runs.claimed_score, runs.claimed_time_ms, runs.claimed_level, runs.claimed_kills, runs.status,
            runs.created_at, players.name
        FROM runs LEFT JOIN players ON players.id = runs.player_id WHERE runs.id = ?`,
        id
    );
    if (!rows) return null;
    const r = rows[0];
    if (!r) return undefined;
    return {
        id: r.id,
        name: displayName(r.name, r.player_id),
        mode: r.mode,
        challengeDate: r.challenge_date,
        build: r.build,
        stage: r.stage,
        score: r.claimed_score,
        timeMs: r.claimed_time_ms,
        level: r.claimed_level,
        kills: r.claimed_kills,
        status: r.status,
        createdAt: new Date(r.created_at).toISOString()
    };
}

export async function getRun(id, env) {
    const run = await loadRun(id, env);
    if (run === null) return dbDown();
    if (!run) return error(404, 'not_found', 'No such run.');
    return json(run, { maxAge: 30 });
}
