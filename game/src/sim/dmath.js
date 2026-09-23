/**
 * @module sim/dmath
 * @description Deterministic math for the simulation. `Math.sin`, `Math.cos`, `Math.atan2`, `Math.hypot`
 * and `Math.pow` are "implementation-approximated" in ECMAScript, and V8 and JavaScriptCore do differ in
 * the last bits. Over tens of thousands of ticks one ULP is enough to change a run, so a score played on
 * iPhone Safari would not re-simulate on a Cloudflare Worker (V8).
 *
 * These versions use only + - * /, Math.floor/round/abs and Math.sqrt. IEEE 754 requires sqrt to be
 * correctly rounded, and every engine emits the hardware instruction for it. Polynomials are the fdlibm
 * kernels, which are accurate to ~1 ULP. Accuracy is a bonus; identical results everywhere is the point.
 */

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
const PIO2 = 1.5707963267948966;
const INV_PIO2 = 6.366197723675814e-1;
const PIO2_HI = 1.5707963267341256; // pi/2 truncated to 33 bits, so n * PIO2_HI is exact for |n| < 2^20
const PIO2_LO = 6.077100506506192e-11; // pi/2 - PIO2_HI

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.0875723212981748279e-9;
const C6 = -1.13596475577881948265e-11;

function ksin(x) {
    const z = x * x;
    return x + x * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))));
}

function kcos(x) {
    const z = x * x;
    return 1 - 0.5 * z + z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
}

/** Reduce x to r in [-pi/4, pi/4] and quadrant q in 0..3 with x = q * pi/2 + r (mod 2pi). */
function reduce(x) {
    const n = Math.round(x * INV_PIO2);
    const r = x - n * PIO2_HI - n * PIO2_LO;
    return [r, ((n % 4) + 4) % 4];
}

export function sin(x) {
    const [r, q] = reduce(x);
    if (q === 0) return ksin(r);
    if (q === 1) return kcos(r);
    if (q === 2) return -ksin(r);
    return -kcos(r);
}

export function cos(x) {
    const [r, q] = reduce(x);
    if (q === 0) return kcos(r);
    if (q === 1) return -ksin(r);
    if (q === 2) return -kcos(r);
    return ksin(r);
}

const ATAN_HI = [
    4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1,
    1.570796326794896558
];
const ATAN_LO = [
    2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17,
    6.12323399573676603587e-17
];
const AT = [
    3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1,
    -1.1111110405462355788e-1, 9.09088713343650656196e-2, -7.69187620504482999495e-2,
    6.66107313738753120669e-2, -5.83357013379057348645e-2, 4.97687799461593236017e-2,
    -3.6531572744216915527e-2, 1.62858201153657823623e-2
];

/** fdlibm s_atan.c, restricted to finite input. */
export function atan(v) {
    const neg = v < 0;
    let x = neg ? -v : v;
    if (x > 1e17) return neg ? -PIO2 : PIO2;
    let id = -1;
    if (x >= 0.4375) {
        if (x < 0.6875) {
            id = 0;
            x = (2 * x - 1) / (2 + x);
        } else if (x < 1.1875) {
            id = 1;
            x = (x - 1) / (x + 1);
        } else if (x < 2.4375) {
            id = 2;
            x = (x - 1.5) / (1 + 1.5 * x);
        } else {
            id = 3;
            x = -1 / x;
        }
    }
    const z = x * x;
    const w = z * z;
    const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
    const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
    let r;
    if (id < 0) r = x - x * (s1 + s2);
    else r = ATAN_HI[id] - (x * (s1 + s2) - ATAN_LO[id] - x);
    return neg ? -r : r;
}

export function atan2(y, x) {
    if (x > 0) return atan(y / x);
    if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
    if (y > 0) return PIO2;
    if (y < 0) return -PIO2;
    return 0;
}

export function hypot(x, y) {
    return Math.sqrt(x * x + y * y);
}

/** Integer power by repeated multiplication (exponent is a small non-negative integer). */
export function ipow(base, n) {
    let r = 1;
    for (let i = 0; i < n; i++) r *= base;
    return r;
}

/** Wrap an angle into (-pi, pi]. */
export function wrapAngle(a) {
    while (a > PI) a -= TAU;
    while (a <= -PI) a += TAU;
    return a;
}
