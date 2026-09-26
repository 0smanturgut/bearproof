/**
 * Solana primitives for the daily prize: a WebCrypto Ed25519 signer (the key never leaves the Worker secret),
 * SOL → $ANSEM through Jupiter, and a Token-2022-aware transfer to the winner.
 *
 * Everything here moves real money, so each function does one thing, confirms it on-chain and returns the
 * signature for the public ledger.
 */

import {
    Connection,
    PublicKey,
    SystemProgram,
    Transaction,
    VersionedTransaction
} from '@solana/web3.js';
import {
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferCheckedInstruction,
    getAssociatedTokenAddressSync
} from '@solana/spl-token';
import { rpcUrl } from './rpc.js';
import { base58Decode, base58Encode } from './vote.js';

export const WSOL = 'So11111111111111111111111111111111111111112';
const JUP = 'https://lite-api.jup.ag/swap/v1';

export { rpcUrl };

export function connection(env) {
    return new Connection(rpcUrl(env), { commitment: 'confirmed', disableRetryOnRateLimit: false });
}

function b64url(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Signer from a base58 64-byte secret (seed + public key), using the platform's native Ed25519. */
export async function signerFromSecret(secretB58) {
    const bytes = base58Decode(secretB58);
    if (!bytes || bytes.length !== 64)
        throw new Error('PRIZE_WALLET_KEY must be a base58 64-byte secret key');
    const seed = bytes.slice(0, 32);
    const pub = bytes.slice(32);
    const key = await crypto.subtle.importKey(
        'jwk',
        { kty: 'OKP', crv: 'Ed25519', d: b64url(seed), x: b64url(pub) },
        { name: 'Ed25519' },
        false,
        ['sign']
    );
    return {
        publicKey: new PublicKey(pub),
        sign: async (message) => new Uint8Array(await crypto.subtle.sign('Ed25519', key, message))
    };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait until a signature is confirmed by polling (no websocket, which a Worker can't keep open reliably).
 * Throws if the transaction failed or its blockhash expired.
 */
export async function confirmSignature(conn, signature, lastValidBlockHeight) {
    for (;;) {
        const { value } = await conn.getSignatureStatuses([signature]);
        const st = value && value[0];
        if (st && st.err) throw new Error(`tx ${signature} failed: ${JSON.stringify(st.err)}`);
        if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized'))
            return signature;
        if ((await conn.getBlockHeight('confirmed')) > lastValidBlockHeight)
            throw new Error(`tx ${signature} expired before confirmation`);
        await sleep(2000);
    }
}

async function sendLegacy(conn, signer, instructions) {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: signer.publicKey, blockhash, lastValidBlockHeight }).add(
        ...instructions
    );
    tx.addSignature(signer.publicKey, Buffer.from(await signer.sign(tx.serializeMessage())));
    const signature = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
    return confirmSignature(conn, signature, lastValidBlockHeight);
}

export async function solBalance(conn, pubkey) {
    return conn.getBalance(new PublicKey(pubkey), 'confirmed');
}

/** Token program and decimals of a mint (ANSEM is Token-2022). */
export async function mintInfo(conn, mint) {
    const info = await conn.getParsedAccountInfo(new PublicKey(mint), 'confirmed');
    if (!info.value) throw new Error(`mint ${mint} not found`);
    return { programId: info.value.owner, decimals: info.value.data.parsed.info.decimals };
}

export async function tokenBalanceRaw(conn, owner, mint, programId) {
    const ata = getAssociatedTokenAddressSync(
        new PublicKey(mint),
        new PublicKey(owner),
        false,
        programId
    );
    try {
        const b = await conn.getTokenAccountBalance(ata, 'confirmed');
        return BigInt(b.value.amount);
    } catch {
        return 0n; // no account yet
    }
}

/** Swap `lamports` SOL into `outputMint` for the signer's own wallet. Returns the tx signature. */
/**
 * A signed, unsent Jupiter swap of `lamports` SOL into `outputMint` for the signer's own wallet, like
 * `signTokenTransfer`: record `signature`, then `broadcast` and `confirmSignature`, and read what it bought with
 * `boughtBy`. `quotedOut` is Jupiter's quote, not the fill.
 */
export async function signSwap(conn, signer, outputMint, lamports, slippageBps = 150) {
    const q = await fetch(
        `${JUP}/quote?inputMint=${WSOL}&outputMint=${outputMint}&amount=${lamports}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`
    ).then((r) => r.json());
    if (!q || !q.outAmount) throw new Error(`jupiter: no route (${q?.error || 'unknown'})`);
    const sw = await fetch(`${JUP}/swap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            quoteResponse: q,
            userPublicKey: signer.publicKey.toBase58(),
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: {
                priorityLevelWithMaxLamports: { maxLamports: 200000, priorityLevel: 'high' }
            }
        })
    }).then((r) => r.json());
    if (!sw?.swapTransaction)
        throw new Error(`jupiter: no swap transaction (${sw?.error || 'unknown'})`);
    const vtx = VersionedTransaction.deserialize(Buffer.from(sw.swapTransaction, 'base64'));
    const sig = await signer.sign(vtx.message.serialize());
    vtx.addSignature(signer.publicKey, sig);
    return {
        signature: base58Encode(sig),
        lastValidBlockHeight: sw.lastValidBlockHeight,
        raw: vtx.serialize(),
        quotedOut: BigInt(q.outAmount)
    };
}

/** Swap `lamports` SOL into `outputMint` and wait for it (the #1-only payout in cron.js). */
export async function swapSolTo(conn, signer, outputMint, lamports, slippageBps = 150) {
    const s = await signSwap(conn, signer, outputMint, lamports, slippageBps);
    const signature = await conn.sendRawTransaction(s.raw, { maxRetries: 3 });
    await confirmSignature(conn, signature, s.lastValidBlockHeight);
    return { signature, quotedOut: s.quotedOut };
}

/**
 * How much of `mint` a confirmed transaction moved into `owner`'s token accounts, read from the transaction's own
 * balances (so other tokens already in the wallet never count). null while the transaction can't be read yet.
 */
export async function boughtBy(conn, signature, owner, mint) {
    const tx = await conn.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
    });
    if (!tx || !tx.meta) return null;
    if (tx.meta.err) throw new Error(`tx ${signature} failed: ${JSON.stringify(tx.meta.err)}`);
    const who = String(owner);
    const sum = (list) =>
        (list || [])
            .filter((b) => b.mint === mint && b.owner === who)
            .reduce((a, b) => a + BigInt(b.uiTokenAmount.amount), 0n);
    return sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances);
}

/**
 * True when sending was refused before the transaction left the RPC (its preflight simulation failed), so it
 * can never land. Any other send error is ambiguous: the transaction may be on its way.
 */
export function refusedBeforeSend(err) {
    const text = `${err?.name || ''} ${err?.message || ''}`;
    return /simulation failed|SendTransactionError|preflight/i.test(text);
}

/** Send `amount` raw units of `mint` to `recipient`, creating their token account if needed. */
export async function sendToken(conn, signer, mint, recipient, amount, { programId, decimals }) {
    const mintKey = new PublicKey(mint);
    const owner = new PublicKey(recipient);
    const from = getAssociatedTokenAddressSync(mintKey, signer.publicKey, false, programId);
    const to = getAssociatedTokenAddressSync(mintKey, owner, false, programId);
    return sendLegacy(conn, signer, [
        createAssociatedTokenAccountIdempotentInstruction(
            signer.publicKey,
            to,
            owner,
            mintKey,
            programId
        ),
        createTransferCheckedInstruction(
            from,
            mintKey,
            to,
            signer.publicKey,
            amount,
            decimals,
            [],
            programId
        )
    ]);
}

/**
 * Build and sign a transaction without sending it. Its signature is known before it goes out, so the caller can
 * record it first: after a crash, the recorded signature says whether the transfer landed, and it is never sent
 * twice. Send it with `broadcast`, then `confirmSignature`.
 */
async function signLegacy(conn, signer, instructions) {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: signer.publicKey, blockhash, lastValidBlockHeight }).add(
        ...instructions
    );
    const sig = await signer.sign(tx.serializeMessage());
    tx.addSignature(signer.publicKey, Buffer.from(sig));
    return { signature: base58Encode(sig), lastValidBlockHeight, raw: tx.serialize() };
}

function tokenTransferInstructions(signer, mint, recipient, amount, { programId, decimals }) {
    const mintKey = new PublicKey(mint);
    const owner = new PublicKey(recipient);
    const from = getAssociatedTokenAddressSync(mintKey, signer.publicKey, false, programId);
    const to = getAssociatedTokenAddressSync(mintKey, owner, false, programId);
    return [
        createAssociatedTokenAccountIdempotentInstruction(
            signer.publicKey,
            to,
            owner,
            mintKey,
            programId
        ),
        createTransferCheckedInstruction(
            from,
            mintKey,
            to,
            signer.publicKey,
            amount,
            decimals,
            [],
            programId
        )
    ];
}

/** A signed, unsent token transfer (creates the recipient's token account if needed). */
export function signTokenTransfer(conn, signer, mint, recipient, amount, info) {
    return signLegacy(
        conn,
        signer,
        tokenTransferInstructions(signer, mint, recipient, amount, info)
    );
}

/** A signed, unsent SOL transfer. */
export function signSolTransfer(conn, signer, recipient, lamports) {
    return signLegacy(conn, signer, [
        SystemProgram.transfer({
            fromPubkey: signer.publicKey,
            toPubkey: new PublicKey(recipient),
            lamports
        })
    ]);
}

export function broadcast(conn, raw) {
    return conn.sendRawTransaction(raw, { maxRetries: 3 });
}

/**
 * Where a recorded signature stands: 'confirmed', 'failed' (landed with an error), 'expired' (never landed and
 * can't any more, so it is safe to send a new one) or 'pending' (look again later).
 */
export async function signatureState(conn, signature, lastValidBlockHeight) {
    const { value } = await conn.getSignatureStatuses([signature], {
        searchTransactionHistory: true
    });
    const st = value && value[0];
    if (st && st.err) return 'failed';
    if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized'))
        return 'confirmed';
    if (st) return 'pending';
    if ((await conn.getBlockHeight('confirmed')) <= lastValidBlockHeight) return 'pending';
    // Not found and past its blockhash. Before calling it gone (and paying again), ask a second way.
    const tx = await conn.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
    });
    if (tx) return tx.meta && tx.meta.err ? 'failed' : 'confirmed';
    return 'expired';
}

export async function sendSol(conn, signer, recipient, lamports) {
    return sendLegacy(conn, signer, [
        SystemProgram.transfer({
            fromPubkey: signer.publicKey,
            toPubkey: new PublicKey(recipient),
            lamports
        })
    ]);
}
