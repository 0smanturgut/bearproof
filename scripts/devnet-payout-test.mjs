#!/usr/bin/env node
// Manual integration test of the prize payout primitives on Solana DEVNET (throwaway keys, no real value):
// WebCrypto signer, Token-2022 transfer with ATA creation, SOL transfer.   node scripts/devnet-payout-test.mjs
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import {
    createMint,
    getOrCreateAssociatedTokenAccount,
    mintTo,
    TOKEN_2022_PROGRAM_ID
} from '@solana/spl-token';
import {
    connection,
    mintInfo,
    sendSol,
    sendToken,
    signerFromSecret,
    tokenBalanceRaw,
    solBalance
} from '../worker/src/lib/solana.js';
import { base58 } from './new-wallet.mjs';
const env = { SOLANA_RPC: process.env.RPC || 'https://api.devnet.solana.com' };
const conn = connection(env);
const payer = Keypair.generate(); // devnet throwaway, never printed
console.log('devnet test wallet', payer.publicKey.toBase58());
let ok = false;
for (let i = 0; i < 3 && !ok; i++) {
    try {
        const sig = await conn.requestAirdrop(payer.publicKey, 1 * LAMPORTS_PER_SOL);
        await conn.confirmTransaction(sig, 'confirmed');
        ok = true;
    } catch (e) {
        console.log('airdrop attempt', i + 1, 'failed:', e.message.slice(0, 80));
        await new Promise((r) => setTimeout(r, 3000));
    }
}
if (!ok) {
    console.log('AIRDROP UNAVAILABLE');
    process.exit(3);
}
console.log('balance', (await solBalance(conn, payer.publicKey)) / LAMPORTS_PER_SOL, 'SOL');
const mint = await createMint(
    conn,
    payer,
    payer.publicKey,
    null,
    6,
    undefined,
    { commitment: 'confirmed' },
    TOKEN_2022_PROGRAM_ID
);
const ata = await getOrCreateAssociatedTokenAccount(
    conn,
    payer,
    mint,
    payer.publicKey,
    false,
    'confirmed',
    undefined,
    TOKEN_2022_PROGRAM_ID
);
await mintTo(
    conn,
    payer,
    mint,
    ata.address,
    payer,
    1_000_000_000n,
    [],
    { commitment: 'confirmed' },
    TOKEN_2022_PROGRAM_ID
);
console.log('mint', mint.toBase58(), 'minted 1000 test tokens');
const signer = await signerFromSecret(base58(payer.secretKey)); // our WebCrypto signer
const recipient = Keypair.generate().publicKey;
const info = await mintInfo(conn, mint.toBase58());
console.log('mint program', info.programId.toBase58(), 'decimals', info.decimals);
const tx1 = await sendToken(
    conn,
    signer,
    mint.toBase58(),
    recipient.toBase58(),
    123_456_789n,
    info
);
const got = await tokenBalanceRaw(conn, recipient, mint.toBase58(), info.programId);
console.log(
    'token transfer',
    tx1,
    '-> recipient has',
    got.toString(),
    got === 123456789n ? 'OK' : 'MISMATCH'
);
const tx2 = await sendSol(conn, signer, recipient.toBase58(), 5_000_000);
console.log(
    'sol transfer',
    tx2,
    '-> recipient SOL',
    (await solBalance(conn, recipient)) / LAMPORTS_PER_SOL
);
