/**
 * @module bounty
 * @description The AI's bounty for this build (`game/bounty.json`, served next to index.html). The server decides
 * what it pays and who clears it (worker/src/lib/bounty.js, on the verified replay); this mirrors its menu, its
 * wording and its check so the game can show the bounty and say honestly whether a run cleared it.
 * Only Daily Challenge runs count. Pure: no DOM.
 */

import { fmtTime } from './format.js';

/** Same menu as the Worker's BOUNTY_TYPES (a test keeps them equal). */
export const BOUNTY_TYPES = {
    survive: { param: 'seconds', min: 300, max: 1200 },
    level: { param: 'level', min: 10, max: 60 },
    kills: { param: 'kills', min: 500, max: 20000 },
    bosses: { param: 'bosses', min: 1, max: 5 },
    win: { param: null }
};

/** A bounty from the file, or null if it isn't one the server would take (the server also checks the name). */
export function readBounty(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const spec = Object.hasOwn(BOUNTY_TYPES, raw.type) ? BOUNTY_TYPES[raw.type] : null;
    if (!spec || typeof raw.name !== 'string') return null;
    const name = raw.name.trim();
    if (name.length < 3 || name.length > 32) return null;
    const bounty = { type: raw.type, name };
    if (spec.param) {
        const v = raw[spec.param];
        if (!Number.isInteger(v) || v < spec.min || v > spec.max) return null;
        bounty[spec.param] = v;
    }
    return bounty;
}

/** The condition in words, exactly as the Worker's bountyText says it. */
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

/** Does a run summary (`sim.summary()`) clear the bounty? The same test the server runs on the replay. */
export function clearsBounty(bounty, summary) {
    if (!bounty || !summary) return false;
    switch (bounty.type) {
        case 'survive':
            return summary.won === true || summary.timeMs >= bounty.seconds * 1000;
        case 'level':
            return summary.level >= bounty.level;
        case 'kills':
            return summary.kills >= bounty.kills;
        case 'bosses':
            return (summary.bossKills || 0) >= bounty.bosses;
        case 'win':
            return summary.won === true;
        default:
            return false;
    }
}

/** Short HUD text for a live run: how far along it is. `summary` needs the fields clearsBounty reads. */
export function bountyProgress(bounty, summary) {
    const done = clearsBounty(bounty, summary);
    if (done) return { done, text: 'BOUNTY CLEARED' };
    switch (bounty.type) {
        case 'survive':
            return {
                done,
                text: `BOUNTY ${fmtTime(summary.timeMs)}/${fmtTime(bounty.seconds * 1000)}`
            };
        case 'level':
            return { done, text: `BOUNTY LV ${summary.level}/${bounty.level}` };
        case 'kills':
            return { done, text: `BOUNTY ${summary.kills}/${bounty.kills} KILLS` };
        case 'bosses':
            return {
                done,
                text: `BOUNTY ${summary.bossKills || 0}/${bounty.bosses} BOSS${bounty.bosses === 1 ? '' : 'ES'}`
            };
        default:
            return { done, text: 'BOUNTY: END THE BEAR MARKET' };
    }
}
