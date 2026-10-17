/**
 * Voting helpers (pure, unit-tested).
 *
 * The daily poll: Proof proposes three features in each devlog (`agent/proposals.json` at the build's tag).
 * The poll runs from 00:00 UTC until the Build Agent starts at 21:00 UTC; the winner ships at the next 00:00 UTC.
 *
 * From OPEN_VOTE_FROM on (D74), anyone votes: no wallet, one vote per person (a device id the page keeps, a bot
 * check, at most VOTES_PER_IP votes from one connection per poll), and every vote counts as 1. Before that, voting
 * was for holders: signing a plain-text message with a Solana wallet, weight = floor(sqrt(whole tokens held)).
 */

export const POLL_CLOSE_UTC_HOUR = 21;
export const MIN_TOKENS_TO_VOTE = 1000;
export const OPEN_VOTE_FROM = '2026-10-17';
export const VOTES_PER_IP = 5;

/** True when the poll of this UTC date is open to everyone (no wallet, one vote each). */
export function isOpenPoll(date) {
    return typeof date === 'string' && date >= OPEN_VOTE_FROM;
}

const VOTER_ID = /^[0-9a-z]{16,40}$/;
/** The random id a browser votes with (hq/vote.js keeps it in localStorage). */
export function isVoterId(s) {
    return typeof s === 'string' && VOTER_ID.test(s);
}
/** How an open vote is keyed in the votes table's `wallet` column: never a valid wallet, never a collision. */
export function voterKey(id) {
    return `v:${id}`;
}

/**
 * The rows a poll counts. In an open poll every vote is one vote, whatever weight it was stored with (a wallet vote
 * cast before the switch reached an open poll counts as one too).
 */
export function countedRows(date, rows) {
    return isOpenPoll(date) ? rows.map((r) => ({ ...r, weight: 1 })) : rows;
}
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

export function base58Encode(bytes) {
    let n = 0n;
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    let out = '';
    while (n > 0n) {
        out = B58[Number(n % 58n)] + out;
        n /= 58n;
    }
    for (const b of bytes) {
        if (b !== 0) break;
        out = '1' + out;
    }
    return out;
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

export const OPERATOR_OPTION_ID = /^op-[a-z0-9-]{2,40}$/;

/**
 * The operator's ballot options for a poll date, from agent/operator-options.json. They are a human's
 * proposals, so they carry `source: 'operator'`, an optional `origin` (where the idea came from, the card's
 * stamp) and `note` (who put it on the ballot and why). Malformed entries are dropped.
 */
export function operatorOptions(file, date) {
    const list = file?.polls?.[date];
    if (!Array.isArray(list)) return [];
    return list
        .filter(
            (o) =>
                OPERATOR_OPTION_ID.test(o?.id) &&
                typeof o.title === 'string' &&
                o.title.length >= 6 &&
                o.title.length <= 60 &&
                typeof o.description === 'string' &&
                o.description.length <= 240 &&
                (o.origin === undefined ||
                    (typeof o.origin === 'string' &&
                        o.origin.length >= 2 &&
                        o.origin.length <= 24)) &&
                (o.note === undefined || (typeof o.note === 'string' && o.note.length <= 240))
        )
        .map((o) => ({
            id: o.id,
            title: o.title,
            description: o.description,
            source: 'operator',
            ...(o.origin ? { origin: o.origin } : {}),
            ...(o.note ? { note: o.note } : {})
        }));
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
