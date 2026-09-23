/**
 * Payout opt-in. A player may leave a Solana address so that, if their run is the verified #1 of a Daily
 * Challenge, the prize can be sent. The address is stored only for that and is never shown anywhere.
 *
 *   POST /api/payout-address { playerId, address }   address = '' removes it
 */

import { clientIp, ipKey, underLimit } from '../lib/guard.js';
import { error, json, readJson } from '../lib/http.js';
import { isUuidV4 } from '../lib/runs.js';
import { isWallet } from '../lib/vote.js';

export async function setPayoutAddress(request, env) {
    const { data, error: bad } = await readJson(request, 1024);
    if (bad) return bad;
    const { playerId, address } = data || {};
    if (!isUuidV4(playerId))
        return error(400, 'invalid_field', 'Bad playerId.', { field: 'playerId' });
    if (address !== '' && !isWallet(address))
        return error(400, 'invalid_field', 'That is not a Solana address.', { field: 'address' });
    if (
        !(await underLimit(
            env.RL_SUBMIT,
            `payout:${playerId}`,
            `payout-ip:${await ipKey(clientIp(request))}`
        ))
    )
        return error(429, 'rate_limited', 'Too many requests. Try again in a minute.');
    try {
        if (address === '') {
            await env.DB.prepare('DELETE FROM payout_addresses WHERE player_id = ?')
                .bind(playerId)
                .run();
            return json({ ok: true, removed: true });
        }
        await env.DB.prepare(
            `INSERT INTO payout_addresses (player_id, sol_address, created_at) VALUES (?1, ?2, ?3)
             ON CONFLICT (player_id) DO UPDATE SET sol_address = excluded.sol_address, created_at = excluded.created_at`
        )
            .bind(playerId, address, Date.now())
            .run();
        return json({ ok: true });
    } catch (err) {
        console.warn('[payout-address]', err?.message || err);
        return error(503, 'db_unavailable', 'Storage is unavailable.');
    }
}
