/**
 * @module nevermore/spec
 * @description The Nevermore test spec (docs/CONTRACT.md §5): a hand-written strict validator (unknown keys are
 * refused, so a `"skip": true` can never sneak in), canonical JSON, and sha256.
 *
 *   {
 *     "id": "N-0001", "product": "bearproof", "name": "…", "finder": "deniz", "report": "B-0007", "foundOn": 23,
 *     "scenario": { "seed": 123, "twist": "none", "character": "bull", "runs": [[code, count], …],
 *                   "picks": [[tick, idx], …], "untilTick": 5400 },
 *     "invariant": { "template": "hp-within-max", "params": {}, "every": "tick" },   // or { "expr": "…" }
 *     "generalise": { "seeds": 8, "bot": "survive", "ticks": 10800 },
 *     "canary": null
 *   }
 */

import { createHash } from 'node:crypto';
import { compile } from './expr.mjs';
import { TEMPLATE_BY_ID } from './invariants.mjs';

export const SPEC_LIMITS = Object.freeze({
    maxRuns: 100000,
    maxPicks: 500,
    maxTicks: 72000 * 2,
    maxSeeds: 64,
    maxName: 140
});

const ID_RE = /^[A-Z]{1,2}-[A-Za-z0-9]{1,32}$/;
const REPORT_RE = /^[A-Z]{1,2}-[0-9]{1,8}$/;
const PRODUCT_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const SLUG_RE = /^[a-z0-9_]{1,40}$/;
const CANARY_RE = /^MUNINN-CANARY-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

function keysOnly(obj, allowed, where, errors) {
    for (const k of Object.keys(obj))
        if (!allowed.includes(k)) errors.push(`${where}: unknown key '${k}'`);
}

function plainText(v, max) {
    // printable text, no control characters, no markup brackets
    return (
        typeof v === 'string' &&
        v.length > 0 &&
        v.length <= max &&
        !/[\u0000-\u001f\u007f<>]/.test(v)
    );
}

/**
 * Validate a parsed spec. Returns `{ ok, errors }`; `errors` are short, fixed-format strings.
 * @param {unknown} spec
 */
export function validateSpec(spec) {
    const errors = [];
    if (!isObj(spec)) return { ok: false, errors: ['spec: not an object'] };
    keysOnly(
        spec,
        [
            'id',
            'product',
            'name',
            'finder',
            'report',
            'foundOn',
            'scenario',
            'invariant',
            'generalise',
            'canary'
        ],
        'spec',
        errors
    );
    if (typeof spec.id !== 'string' || !ID_RE.test(spec.id))
        errors.push('id: expected like N-0001');
    if (typeof spec.product !== 'string' || !PRODUCT_RE.test(spec.product))
        errors.push('product: bad slug');
    if (!plainText(spec.name, SPEC_LIMITS.maxName))
        errors.push(`name: 1..${SPEC_LIMITS.maxName} plain characters`);
    if (spec.finder !== null && spec.finder !== undefined) {
        if (typeof spec.finder !== 'string' || !/^[\p{L}\p{N}._-]{1,40}$/u.test(spec.finder))
            errors.push("finder: an alias without '@' (letters, digits, . _ -)");
    }
    if (
        spec.report !== null &&
        spec.report !== undefined &&
        !(typeof spec.report === 'string' && REPORT_RE.test(spec.report))
    )
        errors.push('report: expected like B-0007 or null');
    if (spec.foundOn !== null && spec.foundOn !== undefined && !isInt(spec.foundOn, 0, 1e6))
        errors.push('foundOn: a build number or null');

    const sc = spec.scenario;
    if (!isObj(sc)) errors.push('scenario: missing');
    else {
        keysOnly(
            sc,
            ['seed', 'twist', 'character', 'runs', 'picks', 'untilTick'],
            'scenario',
            errors
        );
        if (!isInt(sc.seed, 0, 0xffffffff)) errors.push('scenario.seed: u32');
        for (const k of ['twist', 'character'])
            if (
                sc[k] !== null &&
                sc[k] !== undefined &&
                !(typeof sc[k] === 'string' && SLUG_RE.test(sc[k]))
            )
                errors.push(`scenario.${k}: slug or null`);
        let total = 0;
        if (!Array.isArray(sc.runs) || sc.runs.length > SPEC_LIMITS.maxRuns)
            errors.push('scenario.runs: array of [code, count]');
        else
            sc.runs.forEach((r, i) => {
                if (
                    !Array.isArray(r) ||
                    r.length !== 2 ||
                    !isInt(r[0], 0, 255) ||
                    !isInt(r[1], 1, SPEC_LIMITS.maxTicks)
                )
                    errors.push(`scenario.runs[${i}]: [code 0..255, count >= 1]`);
                else total += r[1];
            });
        if (total > SPEC_LIMITS.maxTicks) errors.push('scenario.runs: too many ticks');
        if (!Array.isArray(sc.picks) || sc.picks.length > SPEC_LIMITS.maxPicks)
            errors.push('scenario.picks: array of [tick, idx]');
        else
            sc.picks.forEach((p, i) => {
                if (
                    !Array.isArray(p) ||
                    p.length !== 2 ||
                    !isInt(p[0], 0, SPEC_LIMITS.maxTicks) ||
                    !isInt(p[1], 0, 2)
                )
                    errors.push(`scenario.picks[${i}]: [tick, 0..2]`);
                else if (i > 0 && Array.isArray(sc.picks[i - 1]) && p[0] < sc.picks[i - 1][0])
                    errors.push(`scenario.picks[${i}]: ticks must not decrease`);
            });
        if (!isInt(sc.untilTick, 0, SPEC_LIMITS.maxTicks))
            errors.push('scenario.untilTick: integer');
    }

    const inv = spec.invariant;
    if (!isObj(inv)) errors.push('invariant: missing');
    else {
        keysOnly(inv, ['template', 'expr', 'params', 'every'], 'invariant', errors);
        if ((inv.template === undefined) === (inv.expr === undefined))
            errors.push('invariant: exactly one of template, expr');
        if (
            inv.template !== undefined &&
            !Object.prototype.hasOwnProperty.call(TEMPLATE_BY_ID, inv.template)
        )
            errors.push(`invariant.template: unknown '${String(inv.template).slice(0, 40)}'`);
        if (inv.expr !== undefined) {
            if (typeof inv.expr !== 'string') errors.push('invariant.expr: string');
            else
                try {
                    compile(inv.expr);
                } catch (e) {
                    errors.push(`invariant.expr: ${e.message}`);
                }
        }
        if (inv.params !== undefined) {
            if (!isObj(inv.params) || Object.keys(inv.params).length > 16)
                errors.push('invariant.params: object');
            else
                for (const [k, v] of Object.entries(inv.params)) {
                    if (!/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(k))
                        errors.push(`invariant.params: bad key '${k.slice(0, 40)}'`);
                    if (!(typeof v === 'number' && Number.isFinite(v)) && typeof v !== 'boolean')
                        errors.push(`invariant.params.${k.slice(0, 40)}: finite number or boolean`);
                }
        }
        const ev = inv.every;
        if (
            ev !== undefined &&
            !(ev === 'tick' || ev === 'second' || ev === 'end' || isInt(ev, 1, 3600))
        )
            errors.push("invariant.every: 'tick' | 'second' | 'end' | 1..3600");
    }

    const g = spec.generalise;
    if (!isObj(g)) errors.push('generalise: missing');
    else {
        keysOnly(g, ['seeds', 'bot', 'ticks'], 'generalise', errors);
        if (!isInt(g.seeds, 0, SPEC_LIMITS.maxSeeds))
            errors.push(`generalise.seeds: 0..${SPEC_LIMITS.maxSeeds}`);
        if (g.bot !== 'survive' && g.bot !== 'reckless')
            errors.push("generalise.bot: 'survive' | 'reckless'");
        if (!isInt(g.ticks, 1, SPEC_LIMITS.maxTicks)) errors.push('generalise.ticks: integer');
    }

    if (spec.canary !== null && !(typeof spec.canary === 'string' && CANARY_RE.test(spec.canary)))
        errors.push('canary: null or MUNINN-CANARY-<uuid>');
    return { ok: errors.length === 0, errors };
}

/** True when the spec belongs to the hidden set (it must never be shown, copied or used for a lesson). */
export function isHidden(spec) {
    return (
        !!spec && ((typeof spec.id === 'string' && spec.id.startsWith('H-')) || spec.canary != null)
    );
}

/** JSON with object keys sorted at every level and no whitespace. */
export function canonicalJson(value) {
    if (value === null || typeof value !== 'object') {
        if (typeof value === 'number' && !Number.isFinite(value))
            throw new Error('canonicalJson: non-finite number');
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    const keys = Object.keys(value)
        .filter((k) => value[k] !== undefined)
        .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

/** The on-disk form of an open spec: canonical key order, one `[a, b]` pair per line, trailing newline. */
export function formatSpec(spec) {
    const sorted = JSON.parse(canonicalJson(spec));
    const text = JSON.stringify(sorted, null, 4);
    // collapse the [code, count] / [tick, idx] pairs onto one line each
    return text.replace(/\[\s+(-?\d+),\s+(-?\d+)\s+\]/g, '[$1, $2]') + '\n';
}

export function sha256Hex(data) {
    return createHash('sha256').update(data).digest('hex');
}

/** Parse + validate; throws with all errors joined. */
export function parseSpec(text, where = 'spec') {
    let obj;
    try {
        obj = JSON.parse(text);
    } catch (e) {
        throw new Error(`${where}: not JSON (${e.message})`);
    }
    const { ok, errors } = validateSpec(obj);
    if (!ok) throw new Error(`${where}: ${errors.join('; ')}`);
    return obj;
}
