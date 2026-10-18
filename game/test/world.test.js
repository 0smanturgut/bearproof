// The maps' scenery (world.js, art/props.js, life.js, lighting.js) is render-only: it must never reach the
// simulation, and its layout must be a pure function of the map and the seed, so a Daily looks the same for all.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHUNK, Layout, BIOMES } from '../src/world.js';
import { DECAL_DEFS, PROP_DEFS, decal } from '../src/art/props.js';
import { SPRITES } from '../src/art/sprites.js';
import { STAGE_ROTATION } from '../src/sim/content.js';
import { PROPS } from '../src/sim/terrain.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'src');

const area = (L, r = 3) => {
    const out = [];
    for (let j = -r; j < r; j++) for (let i = -r; i < r; i++) out.push(L.chunk(i, j));
    return out;
};
const strip = (c) => ({
    props: c.props.map((p) => [p.id, Math.round(p.x), Math.round(p.y), p.flip]),
    decals: c.decals.map((d) => [d.id, Math.round(d.x), Math.round(d.y), d.flip])
});

test('world: every map has a biome, and the layout is a pure function of the map and the seed', () => {
    for (const stage of STAGE_ROTATION) {
        assert.ok(BIOMES[stage], `${stage}: biome`);
        const a = area(new Layout(stage, 12345)).map(strip);
        const b = area(new Layout(stage, 12345)).map(strip);
        assert.deepEqual(a, b, `${stage}: same seed, same world`);
        // and a chunk laid out alone agrees with the same chunk laid out among its neighbours
        const lone = strip(new Layout(stage, 12345).chunk(1, -1));
        assert.deepEqual(
            lone,
            a.find((_, i) => i === (-1 + 3) * 6 + (1 + 3))
        );
    }
});

test('world: different seeds make different worlds', () => {
    for (const stage of STAGE_ROTATION) {
        const a = JSON.stringify(area(new Layout(stage, 1), 4).map(strip));
        const b = JSON.stringify(area(new Layout(stage, 2), 4).map(strip));
        assert.notEqual(a, b, stage);
    }
});

test('world: the run starts in a clearing, and the maps are full of scenery', () => {
    for (const stage of STAGE_ROTATION)
        for (const seed of [1, 77, 4242, 99999]) {
            const chunks = area(new Layout(stage, seed), 4);
            const props = chunks.flatMap((c) => c.props);
            for (const p of props) {
                if (!PROP_DEFS[p.id]?.tall) continue;
                assert.ok(Math.hypot(p.x, p.y) > 60, `${stage}/${seed}: ${p.id} on the spawn`);
            }
            // 8x8 chunks = 2048x2048 world units: plenty to look at
            assert.ok(props.length > 60, `${stage}/${seed}: only ${props.length} props`);
            assert.ok(chunks.flatMap((c) => c.decals).length > 300, `${stage}/${seed}: decals`);
        }
});

test('world: every prop and decal placed exists, with a sprite and sane meta', () => {
    for (const stage of STAGE_ROTATION) {
        for (const c of area(new Layout(stage, 7), 4)) {
            for (const p of c.props) {
                assert.ok(PROP_DEFS[p.id], `${p.id}: prop def`);
                assert.ok(SPRITES[p.id], `${p.id}: sprite`);
                assert.ok(p.x >= c.ci * CHUNK && p.x < (c.ci + 1) * CHUNK, `${p.id}: in its chunk`);
            }
            for (const d of c.decals) assert.ok(decal(d.id), `${d.id}: decal`);
        }
    }
    for (const [id, d] of Object.entries(PROP_DEFS)) {
        assert.equal(typeof d.gen, 'function', `${id}: gen`);
        if (d.light) {
            assert.match(d.light.rgb, /^\d{1,3},\d{1,3},\d{1,3}$/, `${id}: light rgb`);
            assert.ok(d.light.r > 0 && d.light.a > 0 && d.light.a <= 1, `${id}: light r/a`);
            assert.ok(
                [undefined, 'fire', 'pulse', 'blink', 'siren'].includes(d.light.flicker),
                `${id}: flicker`
            );
        }
    }
    for (const [id, d] of Object.entries(DECAL_DEFS)) {
        assert.equal(typeof d.gen, 'function', `${id}: gen`);
        const def = decal(id);
        assert.ok(def.w > 0 && def.h > 0, `${id}: size`);
    }
});

test('world: the ground is a colour for every pixel, the same every time', () => {
    for (const stage of STAGE_ROTATION) {
        const L = new Layout(stage, 31);
        for (let i = 0; i < 400; i++) {
            const x = Math.sin(i) * 3000;
            const y = Math.cos(i * 1.3) * 3000;
            const c = L.ground(x, y, i, i * 3);
            assert.equal(c.length, 3);
            for (const v of c) assert.ok(Number.isInteger(v) && v >= 0 && v <= 255);
            assert.deepEqual(c, L.ground(x, y, i, i * 3));
        }
    }
});

test('world: the simulation never imports the renderer or the art, and the renderer only reads its layout', () => {
    const simDir = path.join(src, 'sim');
    for (const f of fs.readdirSync(simDir)) {
        const text = fs.readFileSync(path.join(simDir, f), 'utf8');
        assert.doesNotMatch(
            text,
            /from '\.\.\/|from '\.\.\/art|art\/props|art\/biomes/,
            `sim/${f}`
        );
    }
    // the props the renderer draws are the ones the simulation collides with: one layout, from sim/terrain.js
    const world = fs.readFileSync(path.join(src, 'world.js'), 'utf8');
    const simImports = [...world.matchAll(/from '\.\/sim\/([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(simImports, ['terrain.js']);
    for (const f of ['life.js', 'lighting.js', 'art/props.js']) {
        const text = fs.readFileSync(path.join(src, f), 'utf8');
        assert.doesNotMatch(text, /from '\.\/sim\/|from '\.\.\/sim\//, `${f} imports the sim`);
    }
});

test('world: every prop the terrain can place has art, so nothing solid is ever invisible', () => {
    for (const id of Object.keys(PROPS)) {
        assert.ok(PROP_DEFS[id], `${id}: art/props.js`);
        assert.ok(SPRITES[id], `${id}: sprite`);
    }
    for (const id of Object.keys(PROP_DEFS))
        assert.ok(PROPS[id], `${id}: placed by sim/terrain.js`);
});
