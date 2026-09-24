// Helpers for the X post images: draw the game's own sprites and icons, crisp, at an integer scale.
import { SPRITES, ICONS, bakeSprite, bakeIcon, bakeGlow } from '/game/src/art/sprites.js';

/** Draw sprite (or icon) `id` into `canvas`, as large as fits in `box` px (integer scale, at most `max`). */
export function put(canvas, id, box, { icon = false, max = 8, frame = 0, glow = true } = {}) {
    const def = (icon ? ICONS : SPRITES)[id];
    const k = Math.max(1, Math.min(max, Math.floor(box / Math.max(def.w, def.h))));
    const frames = (icon ? bakeIcon : bakeSprite)(id, k);
    const img = frames[frame % frames.length];
    const pad = glow ? 4 * k : 0;
    canvas.width = img.width + pad * 2;
    canvas.height = img.height + pad * 2;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (glow && !icon) {
        const g = bakeGlow(id, k);
        if (g) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.7;
            const gi = g[frame % g.length];
            ctx.drawImage(
                gi,
                Math.round(canvas.width / 2 - gi.width / 2),
                Math.round(canvas.height / 2 - gi.height / 2)
            );
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }
    }
    ctx.drawImage(img, pad, pad);
    return k;
}

export function brand(el) {
    const c = document.createElement('canvas');
    put(c, 'emblem', 44, { max: 3, glow: false });
    el.prepend(c);
}

export async function ready() {
    await Promise.all([...document.images].map((i) => i.decode()));
    window.ready = true;
}
