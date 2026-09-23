#!/usr/bin/env node
/**
 * Generate a fresh Solana keypair for a hot wallet (the daily prize wallet). No dependencies.
 *
 *   node scripts/new-wallet.mjs | npx wrangler secret put PRIZE_WALLET_KEY
 *
 * stdout = the secret key (base58, 64 bytes: seed + public key), so it can be piped straight into a Worker
 * secret and never lands on disk or in the terminal. stderr = the public address, which is safe to share.
 * Run it yourself; nobody else should ever see the secret.
 */
import { generateKeyPairSync } from 'node:crypto';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58(bytes) {
    let n = 0n;
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    let out = '';
    while (n > 0n) {
        out = ALPHABET[Number(n % 58n)] + out;
        n /= 58n;
    }
    for (const b of bytes) {
        if (b !== 0) break;
        out = '1' + out;
    }
    return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    if (process.stdout.isTTY) {
        process.stderr.write(
            'Refusing to print a secret key to the terminal. Pipe it into a secret store instead:\n' +
                '  node scripts/new-wallet.mjs | npx wrangler secret put PRIZE_WALLET_KEY\n'
        );
        process.exit(1);
    }
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    // PKCS#8 DER for Ed25519 ends with the 32-byte seed; SPKI DER ends with the 32-byte public key.
    const seed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32);
    const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
    process.stderr.write(`public address: ${base58(pub)}\n`);
    process.stdout.write(base58(Buffer.concat([seed, pub])));
}
