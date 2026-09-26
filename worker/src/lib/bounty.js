/**
 * The AI's bounty (pure, unit-tested). A build may carry one bounty in `game/bounty.json`, served at
 * `/b/<n>/bounty.json`. The Build Agent picks the challenge from this menu and gives it a name. What a bounty is
 * worth and who gets paid are not in the file and not in the agent's reach: they are set by the prize rules in
 * this Worker. A verified Daily Challenge run clears the bounty when its verifier stats (scripts/verify-runs.mjs,
 * `runStats`) meet the condition. A file that fails `checkBounty` means no bounty for that build.
 *
 *   { "type": "bosses", "bosses": 1, "name": "Rug Lord Hunt" }
 */

import { checkReply } from './requests.js';

/** type → the one integer it takes and its bounds (inclusive). `win` takes none. */
export const BOUNTY_TYPES = {
    survive: { param: 'seconds', min: 300, max: 1200 }, // still alive at this run time, or ended the bear market
    level: { param: 'level', min: 10, max: 60 },
    kills: { param: 'kills', min: 500, max: 20000 },
    bosses: { param: 'bosses', min: 1, max: 5 }, // The Bear Market counts as a boss
    win: { param: null } // beat The Bear Market
};
export const BOUNTY_NAME_MIN = 3;
export const BOUNTY_NAME_MAX = 32;

/** Validate a bounty file. Returns { ok: true, bounty } (only the known fields) or { ok: false, why }. */
export function checkBounty(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return { ok: false, why: 'not an object' };
    const spec = Object.hasOwn(BOUNTY_TYPES, raw.type) ? BOUNTY_TYPES[raw.type] : null;
    if (!spec) return { ok: false, why: `unknown type ${JSON.stringify(raw.type)}` };
    const name = typeof raw.name === 'string' ? checkReply(raw.name) : null;
    if (!name || name.length < BOUNTY_NAME_MIN || name.length > BOUNTY_NAME_MAX)
        return {
            ok: false,
            why: `name must be ${BOUNTY_NAME_MIN}-${BOUNTY_NAME_MAX} characters, no links or handles`
        };
    const bounty = { type: raw.type, name };
    if (spec.param) {
        const v = raw[spec.param];
        if (!Number.isInteger(v) || v < spec.min || v > spec.max)
            return {
                ok: false,
                why: `${spec.param} must be an integer ${spec.min}-${spec.max}`
            };
        bounty[spec.param] = v;
    }
    return { ok: true, bounty };
}

/** Does a verified run's stats object clear this (checked) bounty? */
export function clearsBounty(bounty, stats) {
    if (!bounty || !stats) return false;
    switch (bounty.type) {
        case 'survive':
            return stats.won === true || stats.t >= bounty.seconds * 1000;
        case 'level':
            return stats.lvl >= bounty.level;
        case 'kills':
            return stats.k >= bounty.kills;
        case 'bosses':
            return stats.bk >= bounty.bosses;
        case 'win':
            return stats.won === true;
        default:
            return false;
    }
}

/** The condition in words, the same everywhere (HQ, share cards). The game shows the same text. */
export function bountyText(bounty) {
    switch (bounty?.type) {
        case 'survive': {
            const m = Math.floor(bounty.seconds / 60);
            const s = String(bounty.seconds % 60).padStart(2, '0');
            return `Survive to ${m}:${s}`;
        }
        case 'level':
            return `Reach level ${bounty.level}`;
        case 'kills':
            return `${bounty.kills.toLocaleString('en-US')} kills in one run`;
        case 'bosses':
            return bounty.bosses === 1 ? 'Defeat a boss' : `Defeat ${bounty.bosses} bosses`;
        case 'win':
            return 'End the bear market';
        default:
            return null;
    }
}
