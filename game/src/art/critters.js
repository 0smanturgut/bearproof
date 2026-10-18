// The maps' small life: crows in the forest, pigeons and rats downtown, hares on the tundra. Drawn with the
// pixel-art engine (art/pixel.js), side view facing RIGHT like every creature. Scenery only: world life
// (life.js) moves them, the simulation never sees them.
//
// Birds: frame 0 stands, 1 pecks, 2-3 flap (wings up, wings down). Rat: 0-1 scurry. Hare: 0 sits, 1-2 hop.

import { PixelSprite, mat } from './pixel.js';
import { C } from './materials.js';

const FEATHER = mat(['#07080C', '#10131B', '#1A1F2B', '#262D3D', '#36405A', '#4A5878'], {
    line: '#040508'
});
const DOVE = mat(['#2A2E38', '#454B58', '#636B7A', '#838B99', '#A6ADB9', '#CDD2DA'], {
    line: '#15171C'
});
const DOVE_DARK = mat(['#1C1F27', '#2E333E', '#434957', '#5A6170', '#737B8A', '#8E96A4'], {
    line: '#0E1014'
});
const RAT = mat(['#16110F', '#2A221D', '#40352D', '#584A3F', '#716153', '#8E7C6B'], {
    line: '#0B0807'
});
const HARE = mat(['#5E6A7E', '#7E8A9E', '#9DA8BA', '#BCC6D4', '#D9E0EA', '#F2F5FA'], {
    line: '#161B26'
});
const BEAK = '#C9A24A';
const PINK = '#C98A92';

/** A small bird, ~13×10: body, head, tail and a wing that stands, pecks or flaps. */
function bird(f, body, wingMat, opts = {}) {
    const s = new PixelSprite(14, 11);
    const peck = f === 1;
    const up = f === 2;
    const down = f === 3;
    const flying = up || down;
    const by = flying ? 5 : 6;
    s.auto('b', { R: 2, grad: 0.25 });
    // tail
    s.poly(
        [
            [1, by - (flying ? 1 : 0)],
            [5, by - 1],
            [5, by + 1],
            [1, by + 2]
        ],
        wingMat,
        { top: 0.5, bot: 0.25 }
    );
    s.ellipse(6.5, by, 3.6, 2.4, body, { g: 'b' });
    const hx = peck ? 10 : 9.5;
    const hy = peck ? by + 2 : by - 2.2;
    s.circle(hx, hy, 1.9, body, { g: 'b' });
    // beak
    s.px(hx + 2, hy + (peck ? 1 : 0), BEAK).px(hx + 2.6, hy + (peck ? 1.6 : 0.4), BEAK);
    s.px(hx + 0.6, hy - 0.6, opts.eye || '#E8E2C8');
    if (opts.neck) s.px(hx - 1, hy + 1.5, opts.neck[0]).px(hx - 1.6, hy + 1, opts.neck[1]);
    // wing
    if (up)
        s.poly(
            [
                [4, by - 1],
                [6, by - 6],
                [9, by - 7],
                [8, by - 1]
            ],
            wingMat,
            { top: 0.75, bot: 0.4 }
        );
    else if (down)
        s.poly(
            [
                [4, by],
                [8, by],
                [7, by + 4],
                [5, by + 4.5]
            ],
            wingMat,
            { top: 0.45, bot: 0.25 }
        );
    else s.ellipse(6, by - 0.2, 2.6, 1.4, wingMat, { shade: 'flat', lum: 0.45 });
    // legs
    if (!flying) s.px(6, by + 3, opts.feet || '#3A3A3A').px(8, by + 3, opts.feet || '#3A3A3A');
    return s.render();
}

/** 14×11 crow (Chop Zone): blue-black, a pale eye glint. */
export function crow(f) {
    return bird(f, FEATHER, FEATHER, { eye: '#C8D0E0' });
}

/** 14×11 pigeon (Bear Trap): grey, darker wings, an oil-sheen neck, pink feet. */
export function pigeon(f) {
    return bird(f, DOVE, DOVE_DARK, { neck: ['#4FA08A', '#8A5AA0'], feet: PINK, eye: '#E07040' });
}

/** 16×8 rat (Bear Trap): a low grey-brown body, a long pink tail, scurrying in two frames. */
export function rat(f) {
    const s = new PixelSprite(18, 8);
    const st = f % 2;
    s.line(1, 4 + st, 5, 5, { ramp: [PINK], line: '#2A1012', glow: null }, { w: 1 });
    s.auto('r', { R: 2, grad: 0.25 });
    s.ellipse(9, 4.5, 4.5, 2.4, RAT, { g: 'r' });
    s.ellipse(13.5, 4.6, 2.6, 1.8, RAT, { g: 'r' });
    s.circle(12.2, 2.6, 1, RAT, { shade: 'flat', lum: 0.75 });
    s.px(15.5, 4.8, PINK).px(14, 4, C.ink);
    s.px(7 + st, 7, '#2A221D').px(11 - st, 7, '#2A221D');
    return s.render();
}

/** 16×14 snow hare (Crypto Winter): pale, long ears, dark eye; sits, then hops. */
export function hare(f) {
    const s = new PixelSprite(16, 14);
    const hop = f > 0;
    const stretch = f === 1;
    const by = hop ? (stretch ? 8 : 7) : 9;
    s.auto('h', { R: 2.5, grad: 0.25 });
    if (stretch) s.ellipse(7, by, 5.4, 2.6, HARE, { g: 'h' });
    else s.ellipse(6.5, by, 4.4, 3.4, HARE, { g: 'h' });
    s.circle(stretch ? 12.5 : 11, by - 2.5, 2.3, HARE, { g: 'h' });
    const hx = stretch ? 12.5 : 11;
    // ears laid back while hopping, up while sitting
    s.capsule(
        hx - 0.5,
        by - 4,
        hop ? hx - 4 : hx - 1.2,
        hop ? by - 6.2 : by - 8.5,
        0.9,
        0.7,
        HARE,
        { g: 'ears' }
    );
    s.capsule(hx + 0.4, by - 4, hop ? hx - 3 : hx + 0.6, hop ? by - 7 : by - 8.8, 0.9, 0.7, HARE, {
        g: 'ears'
    });
    s.auto('ears', { R: 1, grad: 0.2 });
    s.px(hx + 1, by - 3, C.ink).px(hx + 2.4, by - 2, PINK);
    s.circle(2, by - 1, 1.2, HARE, { shade: 'flat', lum: 0.95 }); // the tail
    if (stretch) s.capsule(4, by + 1.5, 1, by + 3, 0.8, 0.7, HARE, { shade: 'flat', lum: 0.6 });
    else s.capsule(8, by + 2, 9.5, by + 3.4, 0.9, 0.8, HARE, { shade: 'flat', lum: 0.6 });
    return s.render();
}
