/**
 * Internal endpoints for the replay verifier (scripts/verify-runs.mjs). Bearer `INGEST_TOKEN` only.
 *
 *   GET  /api/internal/runs/pending?limit=50   runs waiting for verification, with their input logs
 *   POST /api/internal/runs/:id/verdict         { status: 'verified'|'rejected'|'unverifiable', verifiedScore?, reason? }
 *
 * The verifier re-simulates each run with the exact build it was played on and reports what it found.
 * Only `verified` runs can win prizes.
 */

import { all } from '../lib/db.js';
import { error, json, readJson } from '../lib/http.js';
import { RUN_ID } from '../lib/runs.js';

const STATUSES = new Set(['verified', 'rejected', 'unverifiable']);

function timingSafeEqual(a, b) {
    const x = new TextEncoder().encode(String(a));
    const y = new TextEncoder().encode(String(b));
    let diff = x.length ^ y.length;
    for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
    return diff === 0;
}

export function authorized(request, env) {
    const header = request.headers.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    return !!env.INGEST_TOKEN && token.length > 0 && timingSafeEqual(token, env.INGEST_TOKEN);
}

function toBase64Url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function pendingRuns(request, env) {
    if (!authorized(request, env)) return error(401, 'unauthorized', 'Bearer token required.');
    const limit = Math.min(
        200,
        Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 50)
    );
    const rows = await all(
        env,
        `SELECT id, mode, challenge_date, build, seed, stage, claimed_score, claimed_time_ms, claimed_kills,
                claimed_level, input_log
           FROM runs WHERE status = 'pending' ORDER BY claimed_score DESC LIMIT ?`,
        limit
    );
    if (!rows) return error(503, 'db_unavailable', 'Storage is unavailable.');
    return json({
        runs: rows.map((r) => ({
            id: r.id,
            mode: r.mode,
            challengeDate: r.challenge_date,
            build: r.build,
            seed: r.seed,
            stage: r.stage,
            claimed: {
                score: r.claimed_score,
                timeMs: r.claimed_time_ms,
                kills: r.claimed_kills,
                level: r.claimed_level
            },
            log: r.input_log ? toBase64Url(new Uint8Array(r.input_log)) : null
        }))
    });
}

export async function verdict(request, env, id) {
    if (!authorized(request, env)) return error(401, 'unauthorized', 'Bearer token required.');
    if (!RUN_ID.test(id)) return error(400, 'invalid_field', 'Bad run id.', { field: 'id' });
    const { data, error: bad } = await readJson(request, 4096);
    if (bad) return bad;
    if (!STATUSES.has(data?.status))
        return error(400, 'invalid_field', 'Bad status.', { field: 'status' });
    const score = Number.isSafeInteger(data.verifiedScore) ? data.verifiedScore : null;
    const reason = typeof data.reason === 'string' ? data.reason.slice(0, 300) : null;
    try {
        const res = await env.DB.prepare(
            `UPDATE runs SET status = ?1, verified_score = ?2, verified_at = ?3, reject_reason = ?4
              WHERE id = ?5 AND status = 'pending'`
        )
            .bind(data.status, score, Date.now(), reason, id)
            .run();
        return json({ ok: true, updated: res.meta?.changes ?? 0 });
    } catch (err) {
        console.warn('[verdict]', err?.message || err);
        return error(503, 'db_unavailable', 'Storage is unavailable.');
    }
}

/**
 * POST /api/internal/payout/selftest — checks the prize wallet setup without paying anyone: the secret parses,
 * WebCrypto signs, the public key matches PRIZE_WALLET, and the wallet's SOL balance is readable.
 */
export async function payoutSelftest(request, env) {
    if (!authorized(request, env)) return error(401, 'unauthorized', 'Bearer token required.');
    if (!env.PRIZE_WALLET_KEY) return json({ ok: false, reason: 'PRIZE_WALLET_KEY not set' });
    const { signerFromSecret, connection, solBalance } = await import('../lib/solana.js');
    try {
        const signer = await signerFromSecret(env.PRIZE_WALLET_KEY);
        const msg = new TextEncoder().encode('bearproof selftest');
        const sig = await signer.sign(msg);
        const pub = await crypto.subtle.importKey(
            'raw',
            signer.publicKey.toBytes(),
            { name: 'Ed25519' },
            false,
            ['verify']
        );
        const verified = await crypto.subtle.verify('Ed25519', pub, sig, msg);
        const address = signer.publicKey.toBase58();
        const lamports = await solBalance(connection(env), address).catch(() => null);
        return json({
            ok: verified && (!env.PRIZE_WALLET || env.PRIZE_WALLET === address),
            address,
            matchesPrizeWalletVar: env.PRIZE_WALLET ? env.PRIZE_WALLET === address : null,
            signatureVerified: verified,
            balanceSol: lamports === null ? null : lamports / 1e9,
            payoutsEnabled: (await env.CONFIG.get('payouts_enabled')) === 'true'
        });
    } catch (err) {
        return json({ ok: false, reason: String(err?.message || err) });
    }
}

/**
 * POST /api/internal/requests/:id/status { status: 'open'|'hidden' }: the operator hides an abusive holder
 * request (its votes stop counting) or restores it. Bearer INGEST_TOKEN.
 */
export async function requestStatus(request, env, id) {
    if (!authorized(request, env)) return error(401, 'unauthorized', 'Bearer token required.');
    const { data, error: bad } = await readJson(request, 512);
    if (bad) return bad;
    if (!['open', 'hidden'].includes(data?.status))
        return error(400, 'invalid_field', "`status` must be 'open' or 'hidden'.", {
            field: 'status'
        });
    try {
        const r = await env.DB.prepare('UPDATE feature_requests SET status = ?1 WHERE id = ?2')
            .bind(data.status, id)
            .run();
        if (!r.meta?.changes) return error(404, 'not_found', 'No such request.');
    } catch (err) {
        console.warn('[internal] request status', err?.message || err);
        return error(503, 'db_unavailable', 'Storage is unavailable.');
    }
    return json({ ok: true, id, status: data.status });
}
