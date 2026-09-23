/**
 * @module share
 * @description Share text for a finished run (Wordle-style: short, specific, one link) and the
 * platform share sheet with a clipboard fallback.
 */

import { fmtNum, fmtTime } from './format.js';

export function shareText({ summary, mode, date, build, origin }) {
    const head = mode === 'daily' ? `BULL RUN · Daily ${date}` : 'BULL RUN · Free run';
    const line = summary.won
        ? `🐂 I ended the bear market in ${fmtTime(summary.timeMs)}`
        : `🐂 I survived ${fmtTime(summary.timeMs)} of the bear market`;
    const stats = `Score ${fmtNum(summary.score)} · ${fmtNum(summary.kills)} bears · Lv ${summary.level}`;
    const who = `Patch #${build} · a game an AI builds every day`;
    const url = `${origin}/play${mode === 'daily' ? `?challenge=${date}` : ''}`;
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
