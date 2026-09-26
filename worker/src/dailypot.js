/**
 * The Daily Pot on the Worker (the rules are in lib/pot.js): whether holders voted it in, the bounty of a build,
 * settling a day (every recipient, recorded before any money moves) and paying it out one step at a time from the
 * cron: claimed → swapped (one SOL → $ANSEM swap for the whole day) → a transfer per recipient → done.
 *
 * Money safety, on top of cron.js (kill switch, one day claimed once):
 *   - the cron's row lock is a token: every save names it, and a run that lost it stops before sending anything;
 *   - the swap and every transfer are signed first and their signature saved before they are sent, so after a
 *     crash the saved signature says what happened, and nothing is bought or paid twice;
 *   - a signature that looks lost is only given up after two runs agree, and only on an RPC that keeps
 *     transaction history (otherwise it is left for the operator);
 *   - what the swap bought is read from the swap transaction itself, not from the wallet balance;
 *   - rollovers are read from the last settled day in D1, so claiming a day and using its rollover are one write;
 *   - a short prize wallet waits for the operator's top-up instead of failing;
 *   - every step leaves a public ledger row.
 */

import { PublicKey } from '@solana/web3.js';
import { checkBounty, clearsBounty } from './lib/bounty.js';
import { utcDate } from './lib/daily.js';
import { all, first } from './lib/db.js';
import { cleanStats } from './lib/insights.js';
import { POT_OPTION, POT_POLL_DATE, planPot, potAmount, splitBought } from './lib/pot.js';
import { LAMPORTS } from './lib/prize.js';
import * as solana from './lib/solana.js';
import { pollWindow } from './lib/vote.js';

const DAY = 86400000;
const PER_RUN = 5; // transfers per cron run; each waits for its confirmation
const MAX_ATTEMPTS = 3; // failed transfers per recipient, then the share is marked failed
const GIVE_UP_MS = 72 * 3600000; // a share that still couldn't be sent after 3 days is marked failed
const DECIDE_AFTER_MS = 5 * 60000; // a vote accepted in the poll's last second is in D1 by then
const addDays = (date, n) => utcDate(Date.parse(`${date}T00:00:00Z`) + n * DAY);

/** The earliest Daily Challenge the Daily Pot could pay: the day after its poll. */
export const POT_FIRST_DATE = addDays(POT_POLL_DATE, 1);

/** Thrown when a run no longer holds the day's lock: it must stop before it sends anything. */
export class LockLost extends Error {}

// The ballot lives in the vote route (it bundles the build manifest); loaded only when the vote is first read.
const readPollWinner = (env, date) =>
    import('./routes/vote.js').then((m) => m.pollWinner(env, date));

/**
 * The first Daily Challenge date the Daily Pot pays. null: it doesn't apply (the vote isn't settled yet, or the
 * Daily Pot didn't win). undefined: that can't be known right now (KV or the vote unreadable), so whatever moves
 * money must wait instead of guessing. Decided once, 5 minutes after the 26 Sep poll closed, and kept in CONFIG
 * `pot:from` (a date, or 'no'). The operator can overwrite that key in an emergency.
 */
export async function dailyPotFrom(env, now = Date.now(), winnerOf = readPollWinner) {
    let cached;
    try {
        cached = await env.CONFIG.get('pot:from');
    } catch {
        return undefined;
    }
    if (cached) return cached === 'no' ? null : cached;
    if (now < pollWindow(POT_POLL_DATE).close + DECIDE_AFTER_MS) return null;
    const winner = await winnerOf(env, POT_POLL_DATE);
    if (winner === undefined) return undefined;
    const from = winner?.id === POT_OPTION ? POT_FIRST_DATE : 'no';
    await env.CONFIG.put('pot:from', from);
    return from === 'no' ? null : from;
}

/**
 * A build's bounty from its static files (`/b/<n>/bounty.json`, written by the Build Agent).
 * { bounty } when valid, { bounty: null, why } when missing or rejected, { retry: true } when unreadable.
 */
export async function bountyFor(env, build) {
    try {
        const r = await env.ASSETS.fetch(
            new Request(`https://assets.invalid/b/${build}/bounty.json`)
        );
        if (r.status === 404) return { bounty: null, why: 'no bounty in this build' };
        if (!r.ok) return { retry: true };
        const c = checkBounty(await r.json().catch(() => null));
        return c.ok
            ? { bounty: c.bounty }
            : { bounty: null, why: `bounty file rejected: ${c.why}` };
    } catch {
        return { retry: true };
    }
}

function statsOf(row) {
    try {
        return cleanStats(JSON.parse(row.stats || 'null'));
    } catch {
        return null;
    }
}

/** Players (best clearing run each, best first) whose verified run cleared `bounty`. `runs` sorted best first. */
export function bountyClearers(runs, bounty) {
    const seen = new Set();
    const out = [];
    for (const r of runs) {
        if (seen.has(r.player_id) || !clearsBounty(bounty, statsOf(r))) continue;
        seen.add(r.player_id);
        out.push(r);
    }
    return out;
}

/** The day's verified, bot-checked Daily Challenge runs, best first (null when the DB is unavailable). */
export function eligibleRuns(env, date) {
    return all(
        env,
        `SELECT id, player_id, claimed_score, created_at, stats FROM runs
          WHERE challenge_date = ? AND mode = 'daily' AND status = 'verified' AND bot_check = 'passed'
          ORDER BY claimed_score DESC, created_at ASC LIMIT 5000`,
        date
    );
}

/**
 * What rolls into `date`'s pot, from D1: the last settled Daily Pot day's `rollover.out`; before the first one,
 * the #1-only rule's rollover (CONFIG `prize:rollover`) joins the places. null when it can't be read.
 */
export async function rolloverIn(env, date) {
    const rows = await all(
        env,
        'SELECT note FROM daily_winners WHERE date < ? ORDER BY date DESC LIMIT 1',
        date
    );
    if (!rows) return null;
    let note = {};
    try {
        note = JSON.parse(rows[0]?.note || '{}');
    } catch {
        note = {};
    }
    if (note.policy === 'daily-pot' && note.rollover?.out)
        return {
            places: Number(note.rollover.out.places) || 0,
            bounty: Number(note.rollover.out.bounty) || 0
        };
    try {
        return { places: Number((await env.CONFIG.get('prize:rollover')) || 0), bounty: 0 };
    } catch {
        return null;
    }
}

const payable = (address) => {
    try {
        return PublicKey.isOnCurve(new PublicKey(address).toBytes());
    } catch {
        return false;
    }
};

/**
 * Settle a Daily Challenge under the Daily Pot: work out every recipient and record the plan in `daily_winners`
 * (the row is the claim: a day is settled once). No money moves here. Returns true when a payout is pending.
 */
export async function claimDayPot(env, date, { fees, excluded, now = Date.now() }) {
    if (!(excluded instanceof Set)) throw new Error('the operator list is required');
    if (await first(env, 'SELECT date FROM daily_winners WHERE date = ?', date)) return false;
    const pending = await first(
        env,
        "SELECT COUNT(*) AS n FROM runs WHERE challenge_date = ? AND mode = 'daily' AND status = 'pending'",
        date
    );
    if (!pending) return false;
    // Wait for the verifier to finish the day, but not forever: 12 h after the close, settle without the rest.
    const late = now - Date.parse(`${date}T00:00:00Z`) > DAY + 12 * 3600000;
    if (pending.n > 0 && !late) return false;
    const runs = await eligibleRuns(env, date);
    const shown = await all(
        env,
        "SELECT id, player_id, claimed_score FROM runs WHERE challenge_date = ? AND mode = 'daily' AND status != 'rejected' ORDER BY claimed_score DESC, created_at ASC LIMIT 50",
        date
    );
    const addrRows = await all(
        env,
        'SELECT player_id, sol_address FROM payout_addresses WHERE player_id IN (SELECT player_id FROM runs WHERE challenge_date = ?)',
        date
    );
    const daily = await first(env, 'SELECT build FROM daily_challenges WHERE date = ?', date);
    const rollover = await rolloverIn(env, date);
    if (!runs || !shown || !addrRows || !daily || !rollover) return false;
    const b = await bountyFor(env, daily.build);
    if (b.retry) return false;

    const board = [];
    const seen = new Set();
    for (const r of runs) {
        if (seen.has(r.player_id)) continue;
        seen.add(r.player_id);
        board.push(r);
    }
    const clearers = b.bounty ? bountyClearers(runs, b.bounty) : null;
    const addresses = new Map(
        addrRows.filter((a) => payable(a.sol_address)).map((a) => [a.player_id, a.sol_address])
    );
    const pot = potAmount(fees);
    const plan = planPot({ board, clearers, addresses, excluded, pot, rollover });
    const total = plan.recipients.reduce((a, r) => a + r.lamports, 0);
    // The run the day is filed under: the first paid place, else the best run that wasn't rejected or the
    // operator's. Nobody at all: nothing to record (earlier rollovers stay with the last settled day).
    const top = shown.find((r) => !excluded.has(r.player_id));
    const head =
        plan.recipients[0] ||
        (top && { runId: top.id, playerId: top.player_id, score: top.claimed_score });
    if (!head) return false;
    const note = {
        policy: 'daily-pot',
        step: total ? 'claimed' : 'done',
        pot: { feesLamports: fees, ...pot },
        rollover: { in: rollover, out: plan.rollover },
        bounty: b.bounty
            ? { ...b.bounty, build: daily.build, cleared: clearers.length }
            : { none: b.why, build: daily.build },
        recipients: plan.recipients.map((r) => ({ ...r, status: 'pending' })),
        skipped: plan.skipped.slice(0, 40),
        ...(pending.n ? { leftOut: `${pending.n} run(s) still unverified after 12 h` } : {})
    };
    const res = await env.DB.prepare(
        `INSERT OR IGNORE INTO daily_winners (date, run_id, player_id, score, payout_status, payout_token, payout_amount, note, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    )
        .bind(
            date,
            head.runId,
            head.playerId,
            head.score,
            total ? 'pending' : 'skipped',
            total ? 'ANSEM' : null,
            String(total),
            JSON.stringify(note),
            now
        )
        .run();
    if (!res.meta?.changes) return false;
    // The #1-only rollover is used up by now (it only counts before the first Daily Pot day). Best effort: it is
    // never read again unless the operator turns the Daily Pot off.
    if (
        rollover.places &&
        !(await env.CONFIG.put('prize:rollover', '0').then(
            () => true,
            () => false
        ))
    )
        console.warn('[pot] could not reset prize:rollover');
    return total > 0;
}

async function ledgerOut(env, { tx, lamports = null, mint = null, tokenAmount = null, memo }) {
    await env.DB.prepare(
        `INSERT OR IGNORE INTO ledger (id, ts, direction, category, amount_lamports, token_mint, token_amount, memo, tx_signature, source, measured)
         VALUES (?1, ?2, 'out', 'prize', ?3, ?4, ?5, ?6, ?1, 'agent', 1)`
    )
        .bind(tx, Date.now(), lamports, mint, tokenAmount, memo)
        .run();
}

/** True when the payout RPC keeps transaction history, so a signature it can't find really never landed. */
export const archivalRpc = (env) =>
    env.SOLANA_RPC ? env.SOLANA_RPC_ARCHIVAL === 'true' : !!env.HELIUS_API_KEY;

/**
 * Move a pending Daily Pot day forward: the swap, then up to PER_RUN transfers, until `deadline`. The caller
 * (cron.js) holds the row's lock and passes its token as `lock`: every save is conditional on it, and a run that
 * lost it throws LockLost before sending anything. `chain` is lib/solana.js; tests pass a fake one.
 */
export async function advancePot(env, stale, { lock, deadline, chain = solana } = {}) {
    const {
        boughtBy,
        broadcast,
        confirmSignature,
        connection,
        mintInfo,
        refusedBeforeSend,
        signSolTransfer,
        signSwap,
        signTokenTransfer,
        signatureState,
        signerFromSecret,
        solBalance
    } = chain;
    const until = deadline ?? Date.now() + 8 * 60000;
    const row = await first(
        env,
        'SELECT date, note, created_at FROM daily_winners WHERE date = ?',
        stale.date
    );
    if (!row) throw new Error('daily_winners row unreadable');
    const note = JSON.parse(row.note || '{}');
    const list = note.recipients || [];
    const save = async (fields = {}) => {
        const keys = Object.keys(fields);
        const res = await env.DB.prepare(
            `UPDATE daily_winners SET note = ?3${keys.map((k, i) => `, ${k} = ?${i + 4}`).join('')}
              WHERE date = ?1 AND lock_until = ?2`
        )
            .bind(row.date, lock ?? null, JSON.stringify(note), ...Object.values(fields))
            .run();
        if (!res.meta?.changes) throw new LockLost(`lost the lock on ${row.date}`);
    };
    const archival = archivalRpc(env);
    // A signature that can't be found is only given up on a second run, and only when the RPC keeps history.
    const goneForGood = async (o, what) => {
        if (!o.expiredOnce) {
            o.expiredOnce = true;
            await save();
            return false;
        }
        if (!archival) {
            o.lastError = `${what} unconfirmed and the RPC keeps no transaction history: left for the operator`;
            await save();
            return false;
        }
        o.expiredOnce = false;
        return true;
    };
    const conn = connection(env);
    const signer = await signerFromSecret(env.PRIZE_WALLET_KEY);
    const mint = await mintInfo(conn, env.ANSEM_MINT);
    const lamports = list.map((r) => r.lamports);
    const total = lamports.reduce((a, b) => a + b, 0);
    const memo = `bearproof:prize:${row.date}`;

    // A failed swap: try a new one next run, and after two, pay SOL (the published fallback) and say so.
    // Returns true when the payout carries on in SOL right away.
    const swapFailed = async (why) => {
        note.swapFailures = (note.swapFailures || 0) + 1;
        note.lastError = String(why?.message || why).slice(0, 200);
        if (note.swapFailures < 2) {
            await save();
            return false;
        }
        list.forEach((r) => (r.amount = String(r.lamports)));
        Object.assign(note, {
            step: 'swapped',
            token: 'SOL',
            fallback: 'SOL after two failed swaps'
        });
        await save({ payout_token: 'SOL' });
        return true;
    };
    // A confirmed swap: split what it bought, read from the swap transaction. False while it can't be read yet.
    const swapDone = async (sig) => {
        const bought = await boughtBy(conn, sig, signer.publicKey.toBase58(), env.ANSEM_MINT);
        if (bought === null) return false;
        if (bought <= 0n) throw new Error(`swap ${sig} bought nothing: left for the operator`);
        splitBought(bought, lamports).forEach((part, i) => (list[i].amount = part.toString()));
        Object.assign(note, {
            step: 'swapped',
            token: 'ANSEM',
            swapTx: sig,
            bought: bought.toString()
        });
        await ledgerOut(env, {
            tx: sig,
            lamports: total,
            mint: env.ANSEM_MINT,
            tokenAmount: bought.toString(),
            memo: `${memo}:buy`
        });
        await save();
        return true;
    };

    if (note.step === 'claimed' && note.swapSig) {
        // A swap was signed and maybe sent: find out what happened before anything else.
        let st;
        try {
            st = await signatureState(conn, note.swapSig, note.swapLvbh);
        } catch {
            return; // RPC hiccup: look again next run
        }
        if (st === 'pending') return;
        if (st === 'confirmed') {
            if (!(await swapDone(note.swapSig))) return;
        } else {
            if (st === 'expired' && !(await goneForGood(note, 'swap'))) return;
            note.swapSig = null; // it bought nothing
            note.swapLvbh = null;
            if (!(await swapFailed(`swap ${st}`))) return;
        }
    }
    if (note.step === 'claimed') {
        // The pot, plus network fees and up to one new token account per recipient.
        const need = total + Math.round((0.01 + 0.0025 * list.length) * LAMPORTS);
        const bal = await solBalance(conn, signer.publicKey);
        if (bal < need) {
            note.waiting = `prize wallet holds ${(bal / LAMPORTS).toFixed(4)} SOL, needs ${(need / LAMPORTS).toFixed(4)}: waiting for a top-up`;
            await save();
            return;
        }
        delete note.waiting;
        let s = null;
        try {
            s = await signSwap(conn, signer, env.ANSEM_MINT, total);
        } catch (err) {
            if (!(await swapFailed(err))) return; // no route, or Jupiter down
        }
        if (s) {
            Object.assign(note, {
                swapSig: s.signature,
                swapLvbh: s.lastValidBlockHeight,
                quotedOut: String(s.quotedOut)
            });
            await save(); // on record before it goes out
            try {
                await broadcast(conn, s.raw);
                await confirmSignature(conn, s.signature, s.lastValidBlockHeight);
            } catch (err) {
                if (!refusedBeforeSend(err)) {
                    note.lastError = String(err?.message || err).slice(0, 200);
                    await save(); // it may be on its way: the next run finds out
                    return;
                }
                note.swapSig = null; // refused before it left: it can never land
                note.swapLvbh = null;
                if (!(await swapFailed(err))) return;
            }
            if (note.swapSig && !(await swapDone(s.signature))) return;
        }
    }

    if (note.step !== 'swapped') return;
    const markSent = async (r) => {
        r.status = 'sent';
        r.tx = r.sig;
        await ledgerOut(env, {
            tx: r.sig,
            ...(note.token === 'SOL'
                ? { lamports: r.lamports }
                : { mint: env.ANSEM_MINT, tokenAmount: r.amount }),
            memo: `${memo}:${r.kind === 'place' ? `place-${r.place}` : 'bounty'}`
        });
        await save();
    };
    const givingUp = Date.now() - row.created_at > GIVE_UP_MS;
    let tried = 0;
    for (const r of list) {
        if (r.status === 'sent' || r.status === 'failed') continue;
        if (tried >= PER_RUN || Date.now() > until) break;
        tried++;
        if (r.sig) {
            // A transfer was signed and maybe sent earlier: settle what happened to it before anything else.
            let st;
            try {
                st = await signatureState(conn, r.sig, r.lvbh);
            } catch {
                continue; // RPC hiccup: look again next run
            }
            if (st === 'confirmed') {
                await markSent(r);
                continue;
            }
            if (st === 'pending') continue;
            if (st === 'expired' && !(await goneForGood(r, 'transfer'))) continue;
            // It failed on-chain, or never landed: nothing was paid, so a new transfer may be signed.
            r.attempts = (r.attempts || 0) + 1;
            r.lastError = `transfer ${st}`;
            r.sig = null;
            r.lvbh = null;
        }
        if ((r.attempts || 0) >= MAX_ATTEMPTS || givingUp) {
            r.status = 'failed';
            if (givingUp) r.lastError = `${r.lastError || 'not sent'}; gave up after 72 h`;
            await save();
            continue;
        }
        try {
            const signed =
                note.token === 'SOL'
                    ? await signSolTransfer(conn, signer, r.to, BigInt(r.amount))
                    : await signTokenTransfer(
                          conn,
                          signer,
                          env.ANSEM_MINT,
                          r.to,
                          BigInt(r.amount),
                          mint
                      );
            r.sig = signed.signature;
            r.lvbh = signed.lastValidBlockHeight;
            await save(); // on record before it goes out
            await broadcast(conn, signed.raw);
            await confirmSignature(conn, signed.signature, signed.lastValidBlockHeight);
            await markSent(r);
        } catch (err) {
            if (err instanceof LockLost) throw err;
            r.lastError = String(err?.message || err).slice(0, 200);
            if (r.sig && refusedBeforeSend(err)) {
                // Refused before it left the RPC: it can never land, so it may be signed again.
                r.sig = null;
                r.lvbh = null;
                if (/simulation failed/i.test(r.lastError)) r.attempts = (r.attempts || 0) + 1;
            }
            await save(); // a signature still on record may be on its way: the next run checks it
        }
    }
    if (list.every((r) => r.status === 'sent' || r.status === 'failed')) {
        const sent = list.filter((r) => r.status === 'sent');
        note.step = 'done';
        await save({
            payout_status: sent.length ? 'paid' : 'failed',
            payout_tx: sent[0]?.tx || null,
            payout_amount: String(sent.reduce((a, r) => a + BigInt(r.amount), 0n))
        });
    }
}
