/**
 * @module sim/rng
 * @description Seeded PRNG for everything that affects gameplay. sfc32 (Chris Doty-Humphrey's Small Fast
 * Counting generator): 128-bit state, passes PractRand, and uses only 32-bit integer ops, so every JS
 * engine produces the same stream. Cosmetic randomness (particles, shake) must NOT use this; it uses
 * Math.random so that visual settings can never change the gameplay stream.
 */

const TAU = Math.PI * 2;

export class Rng {
    /** @param {number} seed uint32 */
    constructor(seed = 1) {
        this.a = 0x9e3779b9;
        this.b = 0x243f6a88;
        this.c = 0xb7e15162;
        this.d = seed >>> 0;
        for (let i = 0; i < 15; i++) this.u32();
    }

    /** Next uint32. */
    u32() {
        const a = this.a;
        const b = this.b;
        const c = this.c;
        const d = this.d;
        const t = (((a + b) | 0) + d) | 0;
        this.d = (d + 1) | 0;
        this.a = b ^ (b >>> 9);
        this.b = (c + (c << 3)) | 0;
        const r = (c << 21) | (c >>> 11);
        this.c = (r + t) | 0;
        return t >>> 0;
    }

    /** Float in [0, 1). Division by 2^32 is exact. */
    next() {
        return this.u32() / 4294967296;
    }

    /** Float in [lo, hi). */
    range(lo, hi) {
        return lo + (hi - lo) * this.next();
    }

    /** Integer in [0, n). */
    int(n) {
        return Math.floor(this.next() * n);
    }

    /** True with probability p. Consumes one draw only when p > 0. */
    chance(p) {
        return p > 0 && this.next() < p;
    }

    pick(arr) {
        return arr.length ? arr[this.int(arr.length)] : null;
    }

    angle() {
        return this.next() * TAU;
    }

    /** Serialisable state (for hashing and debugging). */
    state() {
        return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
    }
}
