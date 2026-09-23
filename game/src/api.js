/**
 * @module api
 * @description Thin client for the Worker API. Every call fails soft: the game is fully playable offline
 * or from the local dev server (no API), it just can't rank you.
 */

async function call(path, { method = 'GET', body = null, timeout = 6000 } = {}) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    try {
        const res = await fetch(path, {
            method,
            headers: body ? { 'content-type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined,
            signal: ctrl?.signal,
            cache: 'no-store'
        });
        const data = await res.json().catch(() => null);
        return { ok: res.ok, status: res.status, data };
    } catch (err) {
        return { ok: false, status: 0, data: null, error: String(err?.message || err) };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/** This build's identity, written next to index.html by scripts/build.mjs. */
export async function buildInfo() {
    const r = await call('./build-info.json', { timeout: 3000 });
    return r.ok && r.data ? r.data : { n: 'dev', commit: 'working-tree' };
}

export function getDaily(date) {
    return call(`/api/daily${date ? `?date=${encodeURIComponent(date)}` : ''}`);
}

export function getLeaderboard(date) {
    return call(`/api/leaderboard${date ? `?date=${encodeURIComponent(date)}` : ''}`);
}

export function getStats() {
    return call('/api/stats');
}

export function startSession(playerId, build, mode) {
    return call('/api/session', { method: 'POST', body: { playerId, build, mode } });
}

export function submitRun(payload) {
    return call('/api/runs', { method: 'POST', body: payload, timeout: 12000 });
}

export function setPayoutAddress(playerId, address) {
    return call('/api/payout-address', { method: 'POST', body: { playerId, address } });
}

export function setPlayerName(playerId, name) {
    return call('/api/player', { method: 'POST', body: { playerId, name } });
}
