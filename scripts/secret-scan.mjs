#!/usr/bin/env node
/**
 * Secret scan: fails (exit 1) if any changed or new file carries a secret. Runs on the Build Agent's work
 * before anything is committed, and in CI on every push.
 *
 *   node scripts/secret-scan.mjs [<base-ref>]     # changed files vs <base-ref>...HEAD + working tree
 *   node scripts/secret-scan.mjs --all            # every tracked file
 *
 * Two checks: well-known key shapes (Anthropic, GitHub, Cloudflare-style tokens, PEM private keys, Solana
 * secret-key byte arrays), and the exact values of the secrets present in this process's environment
 * (names in SCAN_ENV), plain, base64, hex or reversed. Values are never printed.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const SCAN_ENV = [
    'ANTHROPIC_API_KEY',
    'CLOUDFLARE_API_TOKEN',
    'INGEST_TOKEN',
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'HELIUS_API_KEY',
    'PRIZE_WALLET_KEY',
    'DAILY_SEED_SALT'
];

const SHAPES = [
    ['Anthropic API key', /sk-ant-[A-Za-z0-9_-]{20,}/],
    ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
    ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['Solana secret key bytes', /\[\s*(\d{1,3}\s*,\s*){63}\d{1,3}\s*\]/]
];

/** Every encoding of a secret value we look for. Short values are skipped (too many false hits). */
export function needles(value) {
    if (typeof value !== 'string' || value.length < 12) return [];
    const b = Buffer.from(value, 'utf8');
    return [
        value,
        b.toString('base64').replace(/=+$/, ''),
        b.toString('base64url').replace(/=+$/, ''),
        b.toString('hex'),
        [...value].reverse().join('')
    ];
}

/** @returns {string[]} problems, each "<file>: <what>" (never the value) */
export function scan(files, env = process.env, read = (f) => fs.readFileSync(f, 'utf8')) {
    const secrets = SCAN_ENV.flatMap((name) => needles(env[name]).map((n) => [name, n]));
    const problems = [];
    for (const f of files) {
        let text;
        try {
            text = read(f);
        } catch {
            continue; // deleted or unreadable (binary files read fine as utf8, just noisy)
        }
        for (const [what, re] of SHAPES)
            if (re.test(text)) problems.push(`${f}: looks like a ${what}`);
        for (const [name, n] of secrets)
            if (text.includes(n)) {
                problems.push(`${f}: contains the value of ${name}`);
                break;
            }
    }
    return problems;
}

function changedFiles(base) {
    const out = new Set();
    const add = (t) =>
        t
            .split('\n')
            .filter(Boolean)
            .forEach((p) => out.add(p));
    add(
        execFileSync('git', ['diff', '--name-only', '--diff-filter=d', `${base}...HEAD`]).toString()
    );
    add(execFileSync('git', ['diff', '--name-only', '--diff-filter=d', 'HEAD']).toString());
    add(execFileSync('git', ['ls-files', '--others', '--exclude-standard']).toString());
    return [...out];
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const arg = process.argv[2] || 'origin/main';
    const files =
        arg === '--all'
            ? execFileSync('git', ['ls-files']).toString().split('\n').filter(Boolean)
            : changedFiles(arg);
    const problems = scan(files.filter((f) => !/\.(png|jpe?g|gif|mp4|webm|woff2?|ico)$/i.test(f)));
    console.log(`secret-scan: ${files.length} file(s)`);
    if (problems.length) {
        console.error('SECRET SCAN FAILED:\n  ' + problems.join('\n  '));
        process.exit(1);
    }
    console.log('secret-scan: ok');
}
