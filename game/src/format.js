/** @module format — number and time formatting shared by the HUD, menus and share text. */

export function fmtTime(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtNum(n) {
    return Math.round(n || 0).toLocaleString('en-US');
}
