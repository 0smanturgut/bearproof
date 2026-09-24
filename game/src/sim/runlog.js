/**
 * @module sim/runlog
 * @description The run log: everything needed to re-simulate a run, and nothing else.
 *
 * Binary layout (little-endian):
 *   0   'B' 'R'                magic
 *   2   u8   format version (3; version 1 had no twist byte, version 2 no character byte)
 *   3   u8   sim version (SIM_VERSION)
 *   4   u32  seed
 *   8   u8   twist (index into TWIST_IDS, 0 = none)
 *   9   u8   character (index into CHARACTER_IDS, 0 = the bull)
 *   10  u32  ticks simulated
 *   13  runs of move codes:    u8 code, varint count   … until counts sum to `ticks`
 *   ..  varint pick count, then per pick: varint tick (delta from previous pick), u8 card index
 *
 * A 15-minute run is usually a few KB. `replay()` runs the log through a fresh Simulation headlessly;
 * the server uses it to verify scores, and tests use it to prove determinism.
 */

import { Simulation, SIM_VERSION } from './sim.js';
import { CHARACTER_IDS, SIM, TWIST_IDS } from './content.js';
import { isValidCode } from './input-codes.js';

export const RUNLOG_VERSION = 3;
const MAX_TICKS = SIM.MAX_TICKS;

export class RunRecorder {
    constructor(seed, twist = null, character = null) {
        this.seed = seed >>> 0;
        this.twist = Math.max(0, TWIST_IDS.indexOf(twist || 'none'));
        this.character = Math.max(0, CHARACTER_IDS.indexOf(character || 'bull'));
        this.codes = [];
        this.counts = [];
        this.ticks = 0;
        this.picks = [];
    }

    /** Call once per simulated tick with the code fed to `sim.step`. */
    tick(code) {
        const n = this.codes.length;
        if (n && this.codes[n - 1] === code) this.counts[n - 1]++;
        else {
            this.codes.push(code);
            this.counts.push(1);
        }
        this.ticks++;
    }

    /** Call when a level-up card is chosen; `tick` = sim.tick at that moment. */
    pick(tick, index) {
        this.picks.push([tick, index]);
    }

    toBytes() {
        const out = new ByteWriter();
        out.u8(0x42);
        out.u8(0x52);
        out.u8(RUNLOG_VERSION);
        out.u8(SIM_VERSION);
        out.u32(this.seed);
        out.u8(this.twist);
        out.u8(this.character);
        out.u32(this.ticks);
        for (let i = 0; i < this.codes.length; i++) {
            out.u8(this.codes[i]);
            out.varint(this.counts[i]);
        }
        out.varint(this.picks.length);
        let prev = 0;
        for (const [t, idx] of this.picks) {
            out.varint(t - prev);
            out.u8(idx);
            prev = t;
        }
        return out.bytes();
    }
}

/**
 * Parse bytes into `{ seed, twist, character, ticks, simVersion, runs: [[code, count]], picks: [[tick, idx]] }`.
 * Throws on malformed input.
 */
export function decodeRunLog(bytes) {
    const r = new ByteReader(bytes);
    if (r.u8() !== 0x42 || r.u8() !== 0x52) throw new Error('bad magic');
    const version = r.u8();
    if (version < 1 || version > RUNLOG_VERSION)
        throw new Error(`unsupported log version ${version}`);
    const simVersion = r.u8();
    const seed = r.u32();
    const twistIndex = version >= 2 ? r.u8() : 0;
    if (twistIndex >= TWIST_IDS.length) throw new Error('unknown twist');
    const twist = TWIST_IDS[twistIndex];
    const characterIndex = version >= 3 ? r.u8() : 0;
    if (characterIndex >= CHARACTER_IDS.length) throw new Error('unknown character');
    const character = CHARACTER_IDS[characterIndex];
    const ticks = r.u32();
    if (ticks > MAX_TICKS) throw new Error('too many ticks');
    const runs = [];
    let total = 0;
    while (total < ticks) {
        const code = r.u8();
        const count = r.varint();
        if (!isValidCode(code) || count < 1 || total + count > ticks)
            throw new Error('bad move run');
        runs.push([code, count]);
        total += count;
    }
    const nPicks = r.varint();
    if (nPicks > 500) throw new Error('too many picks');
    const picks = [];
    let t = 0;
    for (let i = 0; i < nPicks; i++) {
        t += r.varint();
        const idx = r.u8();
        if (idx > 2 || t > ticks) throw new Error('bad pick');
        picks.push([t, idx]);
    }
    if (!r.done()) throw new Error('trailing bytes');
    return { seed, twist, character, ticks, simVersion, runs, picks };
}

/**
 * Re-simulate a run log. Returns `{ ok, summary, hash, error }`. `ok` is false when the log doesn't match
 * the simulation (a pick at the wrong tick, inputs after death, or a run that never ended).
 */
export function replay(bytes, { stage = null, onTick = null } = {}) {
    let log;
    try {
        log = decodeRunLog(bytes);
    } catch (err) {
        return { ok: false, error: `decode: ${err.message}` };
    }
    if (log.simVersion !== SIM_VERSION) {
        return { ok: false, error: `sim version ${log.simVersion} != ${SIM_VERSION}` };
    }
    const sim = new Simulation({
        seed: log.seed,
        stage,
        twist: log.twist,
        character: log.character
    });
    let pi = 0;
    for (const [code, count] of log.runs) {
        for (let k = 0; k < count; k++) {
            while (sim.choices) {
                const pick = log.picks[pi];
                if (!pick || pick[0] !== sim.tick) return fail(sim, 'missing or misplaced pick');
                sim.choose(pick[1]);
                pi++;
            }
            if (sim.over) return fail(sim, 'input after the run ended');
            sim.step(code);
            sim.events.length = 0;
            if (onTick) onTick(sim);
        }
    }
    while (sim.choices && pi < log.picks.length && log.picks[pi][0] === sim.tick) {
        sim.choose(log.picks[pi][1]);
        pi++;
    }
    if (pi !== log.picks.length) return fail(sim, 'unused picks');
    if (!sim.over) return fail(sim, 'run did not end');
    return {
        ok: true,
        summary: sim.summary(),
        hash: sim.stateHash(),
        seed: log.seed,
        twist: log.twist,
        character: log.character
    };
}

function fail(sim, error) {
    return { ok: false, error, summary: sim.summary(), hash: sim.stateHash() };
}

// --- tiny byte codec -------------------------------------------------------

class ByteWriter {
    constructor() {
        this.buf = new Uint8Array(1024);
        this.len = 0;
    }
    _grow(n) {
        if (this.len + n <= this.buf.length) return;
        const next = new Uint8Array(Math.max(this.buf.length * 2, this.len + n));
        next.set(this.buf.subarray(0, this.len));
        this.buf = next;
    }
    u8(v) {
        this._grow(1);
        this.buf[this.len++] = v & 0xff;
    }
    u32(v) {
        this._grow(4);
        for (let i = 0; i < 4; i++) this.buf[this.len++] = (v >>> (8 * i)) & 0xff;
    }
    varint(v) {
        let n = v >>> 0;
        do {
            let b = n & 0x7f;
            n >>>= 7;
            if (n) b |= 0x80;
            this.u8(b);
        } while (n);
    }
    bytes() {
        return this.buf.slice(0, this.len);
    }
}

class ByteReader {
    constructor(bytes) {
        this.b = bytes;
        this.i = 0;
    }
    u8() {
        if (this.i >= this.b.length) throw new Error('unexpected end');
        return this.b[this.i++];
    }
    u32() {
        let v = 0;
        for (let k = 0; k < 4; k++) v |= this.u8() << (8 * k);
        return v >>> 0;
    }
    varint() {
        let v = 0;
        let shift = 0;
        for (let k = 0; k < 5; k++) {
            const b = this.u8();
            v |= (b & 0x7f) << shift;
            if (!(b & 0x80)) return v >>> 0;
            shift += 7;
        }
        throw new Error('varint too long');
    }
    done() {
        return this.i === this.b.length;
    }
}

// --- base64url (browser + Workers + Node, no Buffer needed) -----------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function toBase64Url(bytes) {
    let s = '';
    let i = 0;
    for (; i + 2 < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    if (i < bytes.length) {
        const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8);
        s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
        if (i + 1 < bytes.length) s += B64[(n >> 6) & 63];
    }
    return s;
}

export function fromBase64Url(str) {
    const map = new Int16Array(128).fill(-1);
    for (let k = 0; k < 64; k++) map[B64.charCodeAt(k)] = k;
    const clean = String(str).replace(/=+$/, '');
    const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
    let o = 0;
    let acc = 0;
    let bits = 0;
    for (let k = 0; k < clean.length; k++) {
        const c = clean.charCodeAt(k);
        const v = c < 128 ? map[c] : -1;
        if (v < 0) throw new Error('bad base64url');
        acc = (acc << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[o++] = (acc >> bits) & 0xff;
        }
    }
    return out.subarray(0, o);
}
export { dailyTwistForSeed } from './content.js';
