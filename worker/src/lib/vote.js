/**
 * Holder voting helpers (pure, unit-tested).
 *
 * The daily poll: Proof proposes three features in each devlog (`agent/proposals.json` at the build's tag).
 * Holders vote from 00:00 UTC until the Build Agent starts at 21:00 UTC; the winner ships at the next 00:00 UTC.
 * Voting = signing a plain-text message with a Solana wallet. No transaction, no approval, nothing moves.
 * Weight = floor(sqrt(whole tokens held)), read from chain when the vote is cast.
 */

export const POLL_CLOSE_UTC_HOUR = 21;
export const MIN_TOKENS_TO_VOTE = 1000;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Decode(s) {
    if (typeof s !== 'string' || !s.length || s.length > 100) return null;
    let n = 0n;
    for (const ch of s) {
        const v = B58.indexOf(ch);
        if (v < 0) return null;
        n = n * 58n + BigInt(v);
    }
    const bytes = [];
    while (n > 0n) {
        bytes.unshift(Number(n & 0xffn));
        n >>= 8n;
    }
    for (const ch of s) {
        if (ch !== '1') break;
        bytes.unshift(0);
    }
    return Uint8Array.from(bytes);
}

export function isWallet(s) {
    const b = base58Decode(s);
    return !!b && b.length === 32;
}

export function voteWeight(tokens) {
    if (!(tokens >= MIN_TOKENS_TO_VOTE)) return 0;
    return Math.floor(Math.sqrt(tokens));
}

/** The exact text a wallet signs. The server rebuilds it and compares byte for byte. */
export function voteMessage({ domain, wallet, proposalId, forBuild, pollDate, nonce, issuedAt }) {
    return [
        `${domain} wants you to vote with your Solana account:`,
        wallet,
        '',
        `Vote: ${proposalId} for Build #${forBuild} (poll ${pollDate})`,
        'This signature is free. It sends no transaction and moves no funds.',
        '',
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt}`
    ].join('\n');
}

/** Poll window for a UTC date: open 00:00, close 21:00. */
export function pollWindow(dateStr) {
    const open = Date.parse(`${dateStr}T00:00:00Z`);
    return { open, close: open + POLL_CLOSE_UTC_HOUR * 3600000 };
}

export async function verifySignature(wallet, message, signatureB58) {
    const pub = base58Decode(wallet);
    const sig = base58Decode(signatureB58);
    if (!pub || pub.length !== 32 || !sig || sig.length !== 64) return false;
    try {
        const key = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, [
            'verify'
        ]);
        return await crypto.subtle.verify('Ed25519', key, sig, new TextEncoder().encode(message));
    } catch {
        return false;
    }
}

/** Tally rows [{proposal_id, weight}] into shares for the proposals, in proposal order. */
export function tally(proposals, rows) {
    const byId = new Map(proposals.map((p) => [p.id, { ...p, weight: 0, voters: 0 }]));
    for (const r of rows) {
        const p = byId.get(r.proposal_id);
        if (!p) continue;
        p.weight += r.weight;
        p.voters += 1;
    }
    const list = [...byId.values()];
    const total = list.reduce((a, p) => a + p.weight, 0);
    for (const p of list) p.share = total ? Math.round((p.weight / total) * 1000) / 10 : 0;
    const winner = total
        ? list.slice().sort((a, b) => b.weight - a.weight || b.voters - a.voters)[0]
        : null;
    return { proposals: list, totalWeight: total, winner };
}
