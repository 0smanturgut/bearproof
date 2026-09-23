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
import { base58Decode } from './vote.js';

export const WSOL = 'So11111111111111111111111111111111111111112';
const JUP = 'https://lite-api.jup.ag/swap/v1';

export function rpcUrl(env) {
    if (env.HELIUS_API_KEY) return `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
    return env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
}

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

async function sendLegacy(conn, signer, instructions) {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: signer.publicKey, blockhash, lastValidBlockHeight }).add(
        ...instructions
    );
    tx.addSignature(signer.publicKey, Buffer.from(await signer.sign(tx.serializeMessage())));
    const signature = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
    const res = await conn.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
    );
    if (res.value.err) throw new Error(`tx ${signature} failed: ${JSON.stringify(res.value.err)}`);
    return signature;
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
export async function swapSolTo(conn, signer, outputMint, lamports, slippageBps = 150) {
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
    vtx.addSignature(signer.publicKey, await signer.sign(vtx.message.serialize()));
    const signature = await conn.sendRawTransaction(vtx.serialize(), { maxRetries: 3 });
    const res = await conn.confirmTransaction(
        {
            signature,
            blockhash: vtx.message.recentBlockhash,
            lastValidBlockHeight: sw.lastValidBlockHeight
        },
        'confirmed'
    );
    if (res.value.err)
        throw new Error(`swap ${signature} failed: ${JSON.stringify(res.value.err)}`);
    return { signature, quotedOut: BigInt(q.outAmount) };
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

export async function sendSol(conn, signer, recipient, lamports) {
    return sendLegacy(conn, signer, [
        SystemProgram.transfer({
            fromPubkey: signer.publicKey,
            toPubkey: new PublicKey(recipient),
            lamports
        })
    ]);
}
