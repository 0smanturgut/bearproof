/**
 * Scheduled work (Cron Trigger, every 15 minutes):
 *   1. snapshot ClawPump's creator-fee earnings once per UTC day (for the prize policy),
 *   2. settle yesterday's Daily Challenge: pick the verified winner and pay the capped $ANSEM prize,
 *   3. resume a payout that stopped half-way (swap done, transfer not yet),
 *   4. read the treasury's balance and new transactions from chain into the public ledger (lib/treasury.js).
 *
 * Guards: `payouts_enabled` must be "true" in CONFIG (kill switch), the coin and the prize wallet must exist,
 * and each day is claimed once in `daily_winners` before any money moves, so a prize can never be paid twice.
 * Every step leaves a public ledger row.
 */

import { PublicKey } from '@solana/web3.js';
import { all, first } from './lib/db.js';
import { utcDate } from './lib/daily.js';
import { LAMPORTS, pickWinner, prizeAmount } from './lib/prize.js';
import { snapshotBalances, syncLedger } from './lib/treasury.js';
import {
    connection,
    mintInfo,
    sendSol,
    sendToken,
    signerFromSecret,
    solBalance,
    swapSolTo,
    tokenBalanceRaw
} from './lib/solana.js';

const DAY = 86400000;

async function snapshotFees(env, today) {
    if (!env.CLAWPUMP_AGENT_ID) return null;
    const key = `fees:snap:${today}`;
    const have = await env.CONFIG.get(key);
    if (have !== null) return Number(have);
    const r = await fetch(
        `https://clawpump.tech/api/fees/earnings?agentId=${encodeURIComponent(env.CLAWPUMP_AGENT_ID)}`
    );
    if (!r.ok) return null;
    const body = await r.json();
    const total = Number(body?.totalEarned ?? body?.data?.totalEarned);
    if (!Number.isFinite(total)) return null;
    const lamports = Math.round(total * LAMPORTS); // ClawPump reports SOL
    await env.CONFIG.put(key, String(lamports), { expirationTtl: (60 * DAY) / 1000 });
    return lamports;
}

async function fees24h(env, date) {
    const next = utcDate(Date.parse(`${date}T00:00:00Z`) + DAY);
    const [a, b] = await Promise.all([
        env.CONFIG.get(`fees:snap:${date}`),
        env.CONFIG.get(`fees:snap:${next}`)
    ]);
    if (a === null || b === null) return null;
    return Math.max(0, Number(b) - Number(a));
}

async function ledgerRow(env, row) {
    await env.DB.prepare(
        `INSERT OR IGNORE INTO ledger (id, ts, direction, category, amount_lamports, token_mint, token_amount, memo, tx_signature, source, measured)
         VALUES (?1, ?2, 'out', 'prize', ?3, ?4, ?5, ?6, ?7, 'agent', 1)`
    )
        .bind(
            row.tx,
            Date.now(),
            row.lamports ?? null,
            row.mint ?? null,
            row.tokenAmount ?? null,
            row.memo,
            row.tx
        )
        .run();
}

async function setWinner(env, date, fields) {
    const sets = Object.keys(fields).map((k, i) => `${k} = ?${i + 2}`);
    await env.DB.prepare(`UPDATE daily_winners SET ${sets.join(', ')} WHERE date = ?1`)
        .bind(date, ...Object.values(fields))
        .run();
}

/** Pick and record yesterday's winner (idempotent: the row is the claim). */
async function claimDay(env, date) {
    const exists = await first(env, 'SELECT date FROM daily_winners WHERE date = ?', date);
    if (exists) return false;
    const board =
        (await all(
            env,
            `WITH best AS (
                SELECT id, player_id, claimed_score, status, bot_check, created_at,
                       ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY claimed_score DESC, created_at ASC) AS pr
                  FROM runs WHERE challenge_date = ? AND mode = 'daily' AND status != 'rejected')
             SELECT * FROM best WHERE pr = 1 ORDER BY claimed_score DESC, created_at ASC LIMIT 25`,
            date
        )) || [];
    if (!board.length) return false;
    if (board.some((r) => r.status === 'pending')) return false; // wait for the verifier to finish the day
    const addrRows =
        (await all(
            env,
            'SELECT player_id, sol_address FROM payout_addresses WHERE player_id IN (SELECT player_id FROM runs WHERE challenge_date = ?)',
            date
        )) || [];
    // Only wallets that can own a token account (on the ed25519 curve) can be paid.
    const payable = addrRows.filter((a) =>
        PublicKey.isOnCurve(new PublicKey(a.sol_address).toBytes())
    );
    const { winner, skipped } = pickWinner(
        board,
        new Map(payable.map((a) => [a.player_id, a.sol_address]))
    );
    const rollover = Number((await env.CONFIG.get('prize:rollover')) || 0);
    const prize = prizeAmount(await fees24h(env, date), rollover);
    const note = { skipped, policy: prize.reason };
    if (!winner || prize.lamports === 0) {
        await env.DB.prepare(
            `INSERT OR IGNORE INTO daily_winners (date, run_id, player_id, score, payout_status, note, created_at)
             VALUES (?1, ?2, ?3, ?4, 'skipped', ?5, ?6)`
        )
            .bind(
                date,
                winner?.id || board[0].id,
                winner?.player_id || board[0].player_id,
                winner?.claimed_score || board[0].claimed_score,
                JSON.stringify({ ...note, why: winner ? prize.reason : 'no eligible winner' }),
                Date.now()
            )
            .run();
        // prize.lamports already includes the old rollover, so an unpaid prize carries over as-is.
        await env.CONFIG.put(
            'prize:rollover',
            String(prize.lamports > 0 ? prize.lamports : prize.rollover)
        );
        return false;
    }
    const res = await env.DB.prepare(
        `INSERT OR IGNORE INTO daily_winners (date, run_id, player_id, score, payout_status, payout_token, payout_amount, note, created_at)
         VALUES (?1, ?2, ?3, ?4, 'pending', 'ANSEM', ?5, ?6, ?7)`
    )
        .bind(
            date,
            winner.id,
            winner.player_id,
            winner.claimed_score,
            String(prize.lamports),
            JSON.stringify({ ...note, step: 'claimed', to: winner.address }),
            Date.now()
        )
        .run();
    if (res.meta?.changes) await env.CONFIG.put('prize:rollover', '0');
    return !!res.meta?.changes;
}

/** Drive a pending payout forward one step at a time: claimed → swapped → paid. */
async function advancePayout(env, row) {
    const note = JSON.parse(row.note || '{}');
    const conn = connection(env);
    const signer = await signerFromSecret(env.PRIZE_WALLET_KEY);
    const mint = await mintInfo(conn, env.ANSEM_MINT);
    const lamports = Number(row.payout_amount);
    const memo = `bearproof:prize:${row.date}`;

    if (note.step === 'claimed') {
        const bal = await solBalance(conn, signer.publicKey);
        if (bal < lamports + 0.01 * LAMPORTS)
            throw new Error(
                `prize wallet has ${bal / LAMPORTS} SOL, needs ${lamports / LAMPORTS} + fees`
            );
        const before = await tokenBalanceRaw(
            conn,
            signer.publicKey,
            env.ANSEM_MINT,
            mint.programId
        );
        let swap;
        try {
            swap = await swapSolTo(conn, signer, env.ANSEM_MINT, lamports);
        } catch (err) {
            note.swapFailures = (note.swapFailures || 0) + 1;
            if (note.swapFailures < 2) {
                await setWinner(env, row.date, {
                    note: JSON.stringify({ ...note, lastError: String(err.message || err) })
                });
                return;
            }
            // Fallback promised in the rules: pay SOL instead, and say so.
            const tx = await sendSol(conn, signer, note.to, lamports);
            await ledgerRow(env, { tx, lamports, memo: `${memo}:sol-fallback` });
            await setWinner(env, row.date, {
                payout_status: 'paid',
                payout_token: 'SOL',
                payout_tx: tx,
                note: JSON.stringify({
                    ...note,
                    step: 'paid',
                    fallback: 'SOL after two failed swaps'
                })
            });
            return;
        }
        const after = await tokenBalanceRaw(conn, signer.publicKey, env.ANSEM_MINT, mint.programId);
        const got = after - before > 0n ? after - before : swap.quotedOut;
        await ledgerRow(env, {
            tx: swap.signature,
            lamports,
            mint: env.ANSEM_MINT,
            tokenAmount: got.toString(),
            memo: `${memo}:buy`
        });
        Object.assign(note, { step: 'swapped', swapTx: swap.signature, amountRaw: got.toString() });
        await setWinner(env, row.date, { note: JSON.stringify(note) });
    }
    if (note.step === 'swapped') {
        const tx = await sendToken(
            conn,
            signer,
            env.ANSEM_MINT,
            note.to,
            BigInt(note.amountRaw),
            mint
        );
        await ledgerRow(env, {
            tx,
            mint: env.ANSEM_MINT,
            tokenAmount: note.amountRaw,
            memo: `${memo}:send`
        });
        await setWinner(env, row.date, {
            payout_status: 'paid',
            payout_tx: tx,
            payout_amount: note.amountRaw,
            note: JSON.stringify({ ...note, step: 'paid' })
        });
    }
}

export async function scheduled(event, env, ctx) {
    const now = Date.now();
    const today = utcDate(now);
    try {
        await snapshotFees(env, today);
    } catch (err) {
        console.warn('[cron] fees snapshot', err?.message || err);
    }
    if (env.TREASURY_WALLET) {
        try {
            await snapshotBalances(env, now);
            await syncLedger(env);
        } catch (err) {
            console.warn('[cron] treasury sync', err?.message || err);
        }
    }

    const live =
        env.TOKEN_MINT &&
        env.PRIZE_WALLET_KEY &&
        (await env.CONFIG.get('payouts_enabled')) === 'true';
    if (!live) return;
    {
        const yesterday = utcDate(now - DAY);
        if (now - Date.parse(`${today}T00:00:00Z`) > 10 * 60000) await claimDay(env, yesterday);
        const pending =
            (await all(
                env,
                "SELECT * FROM daily_winners WHERE payout_status = 'pending' ORDER BY date LIMIT 3"
            )) || [];
        for (const row of pending) {
            // Atomic claim: only one run may move this day's money at a time.
            const claim = await env.DB.prepare(
                'UPDATE daily_winners SET lock_until = ?1 WHERE date = ?2 AND (lock_until IS NULL OR lock_until < ?3)'
            )
                .bind(now + 10 * 60000, row.date, now)
                .run();
            if (!claim.meta?.changes) continue;
            try {
                await advancePayout(env, row);
            } catch (err) {
                console.error('[cron] payout', row.date, err?.message || err);
                const note = JSON.parse(row.note || '{}');
                note.attempts = (note.attempts || 0) + 1;
                note.lastError = String(err?.message || err).slice(0, 200);
                await setWinner(
                    env,
                    row.date,
                    note.attempts >= 6
                        ? { payout_status: 'failed', note: JSON.stringify(note) }
                        : { note: JSON.stringify(note) }
                );
            } finally {
                await setWinner(env, row.date, { lock_until: null });
            }
        }
    }
    void ctx;
    void event;
}
