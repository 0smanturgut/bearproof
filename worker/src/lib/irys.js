/**
 * Irys (D81): permanent storage for every build, devlog and Daily result. This file speaks Irys's upload format
 * without its SDK: an ANS-104 data item, signed by the storage wallet's Ed25519 key through WebCrypto, posted to
 * Irys's mainnet bundler (uploader.irys.xyz), which seeds it to the Irys L1. Anyone can then read it from the
 * gateway at https://gateway.irys.xyz/<id>.
 *
 * Data item layout (ANS-104 §1.3; a Solana key is signature type 2, Ed25519):
 *   u16 type · 64-byte signature · 32-byte owner · target flag (0) · anchor flag (0) · u64 tag count ·
 *   u64 tag bytes · Avro-encoded tags · data
 * The signature covers a SHA-384 "deep hash" of the fields; the item's id is base58(sha256(signature)). Ed25519 is
 * deterministic and no random anchor is added, so the same content always gets the same id: an upload repeated
 * after a crash is the same item, never a second copy.
 *
 * Paying: the bundler keeps a balance per wallet, topped up by sending it SOL and posting that transaction's id
 * (`fundingPost`). Uploads draw from it; a 402 means it ran dry.
 */
import { base58Encode } from './vote.js';

export const IRYS_NODE = 'https://uploader.irys.xyz';
export const IRYS_GATEWAY = 'https://gateway.irys.xyz';
const SIG_TYPE = 2;
const MAX_TAG_BYTES = 4096;
const enc = new TextEncoder();

function concat(parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
    let at = 0;
    for (const p of parts) {
        out.set(p, at);
        at += p.byteLength;
    }
    return out;
}

const digest = async (alg, bytes) => new Uint8Array(await crypto.subtle.digest(alg, bytes));

export async function sha256Hex(bytes) {
    return [...(await digest('SHA-256', bytes))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/** ANS-104's deep hash: SHA-384 over tagged blobs and lists. */
export async function deepHash(chunk) {
    if (Array.isArray(chunk)) {
        let acc = await digest('SHA-384', enc.encode(`list${chunk.length}`));
        for (const c of chunk) acc = await digest('SHA-384', concat([acc, await deepHash(c)]));
        return acc;
    }
    const tag = await digest('SHA-384', enc.encode(`blob${chunk.byteLength}`));
    return digest('SHA-384', concat([tag, await digest('SHA-384', chunk)]));
}

/** Avro zig-zag varint of a non-negative length (tags are far below 2^30). */
function avroLong(n, out) {
    let m = n * 2;
    do {
        let b = m & 0x7f;
        m = Math.floor(m / 128);
        if (m) b |= 0x80;
        out.push(b);
    } while (m);
}

/** Tags as ANS-104 stores them: an Avro array of {name, value} byte strings. No tags = zero bytes. */
export function serializeTags(tags) {
    if (!tags.length) return new Uint8Array(0);
    const out = [];
    avroLong(tags.length, out);
    for (const { name, value } of tags) {
        if (typeof name !== 'string' || typeof value !== 'string' || !name || !value)
            throw new Error('irys: every tag needs a non-empty string name and value');
        for (const s of [name, value]) {
            const b = enc.encode(s);
            avroLong(b.byteLength, out);
            for (const x of b) out.push(x);
        }
    }
    avroLong(0, out);
    if (out.length > MAX_TAG_BYTES)
        throw new Error(`irys: tags take ${out.length} bytes (max 4096)`);
    return Uint8Array.from(out);
}

function le(n, bytes) {
    const out = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) {
        out[i] = n % 256;
        n = Math.floor(n / 256);
    }
    return out;
}

/**
 * A signed data item. `signer` = { publicKey: Uint8Array(32), sign(message) → Uint8Array(64) } (lib/solana.js
 * signerFromSecret, with publicKey as bytes). Returns { id, bytes }.
 */
export async function createDataItem(data, tags, signer) {
    const owner = signer.publicKey;
    if (owner.byteLength !== 32) throw new Error('irys: owner must be a 32-byte Ed25519 key');
    const raw = typeof data === 'string' ? enc.encode(data) : new Uint8Array(data);
    const rawTags = serializeTags(tags);
    const message = await deepHash([
        enc.encode('dataitem'),
        enc.encode('1'),
        enc.encode(String(SIG_TYPE)),
        owner,
        new Uint8Array(0), // target
        new Uint8Array(0), // anchor
        rawTags,
        raw
    ]);
    const signature = await signer.sign(message);
    if (signature.byteLength !== 64) throw new Error('irys: expected a 64-byte signature');
    const bytes = concat([
        le(SIG_TYPE, 2),
        signature,
        owner,
        Uint8Array.of(0, 0), // no target, no anchor
        le(tags.length, 8),
        le(rawTags.byteLength, 8),
        rawTags,
        raw
    ]);
    return { id: base58Encode(await digest('SHA-256', signature)), bytes };
}

/** Read a data item back (tests, and a check before upload): its fields and the message its signature covers. */
export async function parseDataItem(bytes) {
    const view = new Uint8Array(bytes);
    const type = view[0] | (view[1] << 8);
    const signature = view.subarray(2, 66);
    const owner = view.subarray(66, 98);
    if (view[98] !== 0 || view[99] !== 0) throw new Error('irys: target/anchor not supported here');
    let n = 0;
    let tagBytes = 0;
    for (let i = 7; i >= 0; i--) n = n * 256 + view[100 + i];
    for (let i = 7; i >= 0; i--) tagBytes = tagBytes * 256 + view[108 + i];
    const rawTags = view.subarray(116, 116 + tagBytes);
    const data = view.subarray(116 + tagBytes);
    const message = await deepHash([
        enc.encode('dataitem'),
        enc.encode('1'),
        enc.encode(String(type)),
        owner,
        new Uint8Array(0),
        new Uint8Array(0),
        rawTags,
        data
    ]);
    return { type, signature, owner, tagCount: n, rawTags, data, message };
}

/** Upload a signed item. Resolves { id }; throws with `.code = 'unfunded'` when the balance can't pay for it. */
export async function upload(item, { node = IRYS_NODE } = {}) {
    const r = await fetch(`${node}/tx/solana`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: item.bytes
    });
    if (r.status === 402) {
        const e = new Error(`irys: balance too low (${(await r.text()).slice(0, 120)})`);
        e.code = 'unfunded';
        throw e;
    }
    // 201: the bundler already holds this exact item (a repeat after a crash). Same content, same id.
    if (r.status === 201) return { id: item.id, repeat: true };
    if (!r.ok) throw new Error(`irys upload ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const body = await r.json().catch(() => ({}));
    return { id: body.id || item.id };
}

async function getJson(url) {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`irys ${new URL(url).pathname} ${r.status}`);
    return r.json();
}

/** The wallet's balance at the bundler, in lamports. */
export async function balance(address, { node = IRYS_NODE } = {}) {
    const body = await getJson(
        `${node}/account/balance/solana?address=${encodeURIComponent(address)}`
    );
    const n = Number(body.balance);
    if (!Number.isFinite(n)) throw new Error('irys: unreadable balance');
    return n;
}

/** The bundler's Solana deposit address (where a funding transfer goes). */
export async function depositAddress({ node = IRYS_NODE } = {}) {
    const body = await getJson(`${node}/info`);
    const a = body?.addresses?.solana;
    if (!a || typeof a !== 'string') throw new Error('irys: no Solana deposit address in /info');
    return a;
}

/** Tell the bundler about a confirmed funding transfer so it credits the sender's balance. */
export async function fundingPost(signature, { node = IRYS_NODE } = {}) {
    const r = await fetch(`${node}/account/balance/solana`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tx_id: signature })
    });
    if (r.status !== 200 && r.status !== 202)
        throw new Error(`irys funding post ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return true;
}

/** File extension → Content-Type, for the files of a build (the gateway serves each with its tag). */
const TYPES = {
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json',
    webmanifest: 'application/manifest+json',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    ico: 'image/x-icon',
    woff2: 'font/woff2',
    woff: 'font/woff',
    ttf: 'font/ttf',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    txt: 'text/plain; charset=utf-8',
    md: 'text/plain; charset=utf-8'
};

export function contentType(path) {
    const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase();
    return (ext && TYPES[ext]) || 'application/octet-stream';
}
