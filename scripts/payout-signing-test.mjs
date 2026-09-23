#!/usr/bin/env node
// Offline check of the payout signing path (no funds, no broadcast): our WebCrypto signer signs (1) a Token-2022
// transfer built exactly like a prize payout and (2) a real Jupiter SOL→$ANSEM swap transaction, and each signature
// is verified independently with node:crypto.    node scripts/payout-signing-test.mjs
import { Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import {
    TOKEN_2022_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferCheckedInstruction,
    getAssociatedTokenAddressSync
} from '@solana/spl-token';
import { createPublicKey, verify } from 'node:crypto';
import { signerFromSecret, WSOL } from '../worker/src/lib/solana.js';
import { base58 } from './new-wallet.mjs';

const ANSEM = '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump';
const kp = Keypair.generate(); // throwaway, never funded, never printed
const signer = await signerFromSecret(base58(kp.secretKey));
console.log('signer pubkey matches keypair:', signer.publicKey.equals(kp.publicKey));

// (1) the exact instruction pair sendToken() uses
const mint = new PublicKey(ANSEM);
const winner = Keypair.generate().publicKey;
const from = getAssociatedTokenAddressSync(mint, signer.publicKey, false, TOKEN_2022_PROGRAM_ID);
const to = getAssociatedTokenAddressSync(mint, winner, false, TOKEN_2022_PROGRAM_ID);
const tx = new Transaction({
    feePayer: signer.publicKey,
    blockhash: '11111111111111111111111111111111',
    lastValidBlockHeight: 1
}).add(
    createAssociatedTokenAccountIdempotentInstruction(
        signer.publicKey,
        to,
        winner,
        mint,
        TOKEN_2022_PROGRAM_ID
    ),
    createTransferCheckedInstruction(
        from,
        mint,
        to,
        signer.publicKey,
        7321703n,
        6,
        [],
        TOKEN_2022_PROGRAM_ID
    )
);
const msg = tx.serializeMessage();
tx.addSignature(signer.publicKey, Buffer.from(await signer.sign(msg)));
console.log(
    'transfer tx signature valid:',
    tx.verifySignatures(),
    `(${tx.serialize().length} bytes)`
);

// (2) a real Jupiter swap transaction for this pubkey
const q = await fetch(
    `https://lite-api.jup.ag/swap/v1/quote?inputMint=${WSOL}&outputMint=${ANSEM}&amount=10000000&slippageBps=150&restrictIntermediateTokens=true`
).then((r) => r.json());
const sw = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
        quoteResponse: q,
        userPublicKey: signer.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true
    })
}).then((r) => r.json());
if (!sw.swapTransaction) {
    console.log('jupiter swap build failed:', JSON.stringify(sw).slice(0, 200));
    process.exit(1);
}
const vtx = VersionedTransaction.deserialize(Buffer.from(sw.swapTransaction, 'base64'));
const vmsg = vtx.message.serialize();
vtx.addSignature(signer.publicKey, await signer.sign(vmsg));
const spki = Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    signer.publicKey.toBuffer()
]);
const ok = verify(
    null,
    Buffer.from(vmsg),
    createPublicKey({ key: spki, format: 'der', type: 'spki' }),
    Buffer.from(vtx.signatures[0])
);
console.log(
    'jupiter swap tx: quoted',
    q.outAmount,
    'raw ANSEM for 0.01 SOL; signature valid:',
    ok,
    `(${vtx.serialize().length} bytes)`
);
