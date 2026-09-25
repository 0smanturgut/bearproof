/**
 * @module share
 * @description Share text for a finished run (Wordle-style: short, specific, one link), and the ways out:
 * the platform share sheet, X's composer, the clipboard and the run's card image.
 */

import { fmtNum, fmtTime } from './format.js';
import { TWISTS, characterDef } from './sim/content.js';

export function shareText({ summary, mode, date, build, origin, runId }) {
    const twist = mode === 'daily' && TWISTS[summary.twist] && summary.twist !== 'none';
    const head =
        mode === 'daily'
            ? `BEARPROOF · Daily ${date}${twist ? ` · ${TWISTS[summary.twist].name}` : ''}`
            : 'BEARPROOF · Free run';
    const face = characterDef(summary.character).emoji || '🐂';
    const line = summary.won
        ? `${face} I ended the bear market in ${fmtTime(summary.timeMs)}`
        : `${face} I survived ${fmtTime(summary.timeMs)} of the bear market`;
    const stats = `Score ${fmtNum(summary.score)} · ${fmtNum(summary.kills)} bears · Lv ${summary.level}`;
    const who = `Build #${build} · a game an AI builds every day`;
    // A submitted run links to its own page, which unfurls as a share card with the score.
    const url = runId
        ? `${origin}/run/${runId}`
        : `${origin}/play${mode === 'daily' ? `?challenge=${date}` : ''}`;
    return { text: [head, line, stats, who].join('\n'), url };
}

/** X's post composer, prefilled. The /run/<id> link unfurls as the run's card. */
export function xIntentUrl({ text, url }) {
    return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

/** Copy to the clipboard, with the old textarea trick where the async API is missing or blocked. */
export async function copyText(value) {
    try {
        await navigator.clipboard.writeText(value);
        return true;
    } catch {
        /* fall through */
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, value.length);
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch {
        return false;
    }
}

/** The platform share sheet exists (phones, some desktops). */
export function canNativeShare() {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * Open the platform share sheet. `file` (the run's card as a PNG File) is attached when the platform takes
 * files. Call it straight from a click: Safari refuses a share that isn't a direct response to the tap.
 * @returns {Promise<'shared'|'cancelled'|'failed'>}
 */
export async function nativeShare({ text, url, file = null }) {
    const data = { text, url };
    if (file && navigator.canShare?.({ files: [file] })) data.files = [file];
    try {
        await navigator.share(data);
        return 'shared';
    } catch (err) {
        return err?.name === 'AbortError' ? 'cancelled' : 'failed';
    }
}

/** The run's share card as a File, or null (no run id yet, offline). Fetched ahead of the tap. */
export async function fetchCard(origin, runId) {
    if (!runId) return null;
    try {
        const r = await fetch(`${origin}/og/run/${runId}.png`);
        if (!r.ok) return null;
        const blob = await r.blob();
        return new globalThis.File([blob], `bearproof-${runId}.png`, { type: 'image/png' });
    } catch {
        return null;
    }
}
