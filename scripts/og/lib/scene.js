// Shared drawing for the brand images: the parade (the bull charging, the bear market chasing), drawn
// with the game's own sprites. Used by the HTML templates in scripts/og/.
import { SPRITES, bakeGlow, bakeSprite } from '/game/src/art/sprites.js';

export { SPRITES, bakeSprite, bakeGlow };

function glow(ctx, id, x, y, k, frame = 0, a = 0.8) {
    const g = bakeGlow(id, k);
    if (!g) return;
    const img = g[frame % g.length];
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
}

/**
 * Draw a parade on `ctx` along a ground line at `ground`, with the bull at `bx`.
 * `cast` = enemy ids trailing behind, `gap` px apart; `ahead` = XP candles in front.
 */
export function parade(ctx, { W, ground, bx, k, cast, gap, ahead = 3, candles = true, seed = 7 }) {
    ctx.imageSmoothingEnabled = false;
    let r = seed;
    const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    if (candles) {
        for (let x = 0; x < W; x += 16 * (k / 3)) {
            const h = (40 + rnd() * 120) * (k / 3);
            ctx.fillStyle = rnd() < 0.45 ? 'rgba(22,224,138,0.13)' : 'rgba(255,59,92,0.13)';
            ctx.fillRect(
                Math.round(x),
                Math.round(ground - h),
                Math.round(9 * (k / 3)),
                Math.round(h * 0.6)
            );
        }
    }
    ctx.strokeStyle = 'rgba(22,224,138,0.85)';
    ctx.lineWidth = Math.max(2, k * 0.8);
    ctx.shadowColor = 'rgba(22,224,138,0.9)';
    ctx.shadowBlur = k * 5;
    ctx.beginPath();
    ctx.moveTo(0, ground);
    ctx.lineTo(W, ground);
    ctx.stroke();
    ctx.shadowBlur = 0;
    const put = (id, x, frame, lift = 0) => {
        const f = bakeSprite(id, k);
        const img = f[frame % f.length];
        const y = ground - img.height + k - lift;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(Math.round(x - img.width * 0.35), ground - k, Math.round(img.width * 0.7), k);
        ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y));
        glow(ctx, id, x, y + img.height / 2, k, frame, 0.75);
        return img;
    };
    const bull = SPRITES.bull;
    cast.forEach((id, i) =>
        put(id, bx - bull.w * k * 0.85 - (i + 1) * gap, i, id === 'fud_cloud' ? 8 * k : 0)
    );
    for (let i = 0; i < ahead; i++) {
        const id = i % 3 === 2 ? 'xp_candle_big' : 'xp_candle';
        put(id, bx + bull.w * k * 0.7 + i * gap * 0.9, 0, 6 * k);
    }
    put('bull', bx, 1);
}
