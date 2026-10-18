// The scenery of each map: standing props (trees, walls, lamps...) that sort in with the creatures, and flat
// decals (grass, cracks, puddles...) baked into the ground. Drawn by world.js. Render-only, like stages.js:
// nothing here can change a run, and nothing in the simulation knows the scenery is there.
//
// Each biome module (biomes/<stage>.js) exports two tables, keyed by id (prefixed with the biome):
//
//   PROPS[id] = {
//       gen(f) -> PixelSprite.render() result for frame f (outlined, like every sprite)
//       frames?: n (default 1), fps?: animation speed (default 8 when frames > 1)
//       foot?: art px from the sprite's bottom edge to where it touches the ground (default 2)
//       shadow?: contact shadow width as a fraction of the sprite's width (default 0.8, 0 = none)
//       tall?: true when it can hide a creature standing behind it (it fades while the player is there)
//       light?: { rgb: 'r,g,b', r: radius in world units, a: strength 0..1, x, y: art px from the sprite's
//                 centre, flicker?: 'fire' | 'pulse' | 'blink' | 'siren' }
//   }
//   DECALS[id] = {
//       gen() -> PixelSprite.render() result, usually { outline: false }: flat marks on the ground
//       water?: true for puddles and ponds (glints and ripples are drawn over them), ice?: true for frozen ones
//       steam?: true for a manhole that breathes steam
//   }
//
// Sprites are generated lazily (on first use), so importing this module costs nothing.

import { toDef } from './pixel.js';
import * as chop from './biomes/chop.js';
import * as trap from './biomes/trap.js';
import * as winter from './biomes/winter.js';
import * as eras from './biomes/eras.js';

export const PROP_DEFS = { ...chop.PROPS, ...trap.PROPS, ...winter.PROPS, ...eras.PROPS };
export const DECAL_DEFS = { ...chop.DECALS, ...trap.DECALS, ...winter.DECALS, ...eras.DECALS };

/** SPRITE_GENS entries for every standing prop (sprites.js spreads these into its table). */
export function propSpriteGens() {
    const out = {};
    for (const [id, d] of Object.entries(PROP_DEFS)) {
        const n = d.frames || 1;
        out[id] = () =>
            toDef(
                Array.from({ length: n }, (_, f) => d.gen(f)),
                n > 1 ? { fps: d.fps || 8 } : {}
            );
    }
    return out;
}

const decalCache = new Map();

/** A decal in the sprite grid format ({ w, h, frames: [rows], colors }), built once. */
export function decal(id) {
    if (decalCache.has(id)) return decalCache.get(id);
    const d = DECAL_DEFS[id];
    const def = d ? toDef([d.gen()]) : null;
    decalCache.set(id, def);
    return def;
}
