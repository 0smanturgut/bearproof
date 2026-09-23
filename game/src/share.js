/**
 * @module share
 * @description Share text for a finished run (Wordle-style: short, specific, one link) and the
 * platform share sheet with a clipboard fallback.
 */

import { fmtNum, fmtTime } from './format.js';
import { TWISTS } from './sim/content.js';

export function shareText({ summary, mode, date, build, origin, runId }) {
    const twist = mode === 'daily' && TWISTS[summary.twist] && summary.twist !== 'none';
    const head =
        mode === 'daily'
            ? `BEARPROOF · Daily ${date}${twist ? ` · ${TWISTS[summary.twist].name}` : ''}`
            : 'BEARPROOF · Free run';
    const line = summary.won
        ? `🐂 I ended the bear market in ${fmtTime(summary.timeMs)}`
        : `🐂 I survived ${fmtTime(summary.timeMs)} of the bear market`;
    const stats = `Score ${fmtNum(summary.score)} · ${fmtNum(summary.kills)} bears · Lv ${summary.level}`;
    const who = `Build #${build} · a game an AI builds every day`;
    // A submitted run links to its own page, which unfurls as a share card with the score.
    const url = runId
        ? `${origin}/run/${runId}`
        : `${origin}/play${mode === 'daily' ? `?challenge=${date}` : ''}`;
    return { text: [head, line, stats, who].join('\n'), url };
}

/** Returns 'shared' | 'copied' | 'failed'. */
export async function share({ text, url }) {
    const full = `${text}\n${url}`;
    try {
        if (navigator.share && matchMedia('(pointer: coarse)').matches) {
            await navigator.share({ text, url });
            return 'shared';
        }
    } catch (err) {
        if (err?.name === 'AbortError') return 'failed';
    }
    try {
        await navigator.clipboard.writeText(full);
        return 'copied';
    } catch {
        return 'failed';
    }
}
