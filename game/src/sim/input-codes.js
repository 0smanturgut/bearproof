/**
 * @module sim/input-codes
 * @description One byte per tick encodes the player's move input: 0 = idle, otherwise
 * 1 + (magnitude - 1) * 64 + direction, with 64 directions and 3 magnitudes (1/3, 2/3, 1).
 * The live game quantises its input with `encodeMove` and feeds the *code* to the simulation, so live
 * play and a server replay run exactly the same computation. The code → vector table is built with
 * sim/dmath, so it is identical on every engine.
 */

import { cos, sin, TAU } from './dmath.js';

export const DIRECTIONS = 64;
export const MAGNITUDES = 3;
export const MAX_CODE = MAGNITUDES * DIRECTIONS;

/** MOVE_TABLE[code] = [x, y]. */
export const MOVE_TABLE = (() => {
    const t = [[0, 0]];
    for (let m = 1; m <= MAGNITUDES; m++) {
        for (let d = 0; d < DIRECTIONS; d++) {
            const a = (d / DIRECTIONS) * TAU;
            t.push([(cos(a) * m) / MAGNITUDES, (sin(a) * m) / MAGNITUDES]);
        }
    }
    return t;
})();

/** Quantise a move vector (|v| ≤ 1) to a code. Client-side only, so Math.* is fine here. */
export function encodeMove(x, y) {
    const len = Math.hypot(x, y);
    if (!(len > 0.12)) return 0;
    const m = Math.min(MAGNITUDES, Math.max(1, Math.round(Math.min(1, len) * MAGNITUDES)));
    let d = Math.round((Math.atan2(y, x) / (Math.PI * 2)) * DIRECTIONS) % DIRECTIONS;
    if (d < 0) d += DIRECTIONS;
    return 1 + (m - 1) * DIRECTIONS + d;
}

export function isValidCode(c) {
    return Number.isInteger(c) && c >= 0 && c <= MAX_CODE;
}
