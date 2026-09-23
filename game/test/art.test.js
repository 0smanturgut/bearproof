// Shape checks for the procedural pixel art in src/art/. Guards the grid format the
// renderer relies on and the id list the reskin references.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PAL } from '../src/art/palette.js';
import {
    SPRITES,
    SPRITE_GROUPS,
    ICONS,
    ICON_GROUPS,
    bakeSprite,
    bakeIcon
} from '../src/art/sprites.js';

const SPRITE_IDS = [
    'bull',
    'red_candle',
    'bag_holder',
    'paper_hands',
    'rug_puller',
    'grizzly',
    'fud_cloud',
    'doomposter',
    'ponzi',
    'downline',
    'margin_call',
    'sybil',
    'rug_lord',
    'capitulation',
    'liquidation',
    'bear_market',
    'long_winter',
    'xp_candle',
    'xp_candle_big',
    'green_candle',
    'laser',
    'diamond',
    'airdrop',
    'limit_order',
    'dead_cat',
    'fud_bolt',
    'heart'
];

const ICON_IDS = [
    // weapons
    'horns',
    'green_candle',
    'laser_eyes',
    'diamond_hands',
    'airdrop',
    'limit_order',
    'hopium',
    'circuit_breaker',
    'buyback',
    'dead_cat_bounce',
    // passives
    'thick_skin',
    'dca',
    'cold_wallet',
    'momentum',
    'conviction',
    'liquidity',
    'high_frequency',
    'whale_gravity',
    'compounding',
    'alpha',
    'slippage',
    'hedge',
    'leverage'
];

const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v);

function checkShape(table, label) {
    for (const [id, def] of Object.entries(table)) {
        assert.ok(Number.isInteger(def.w) && def.w > 0, `${label} ${id}: w`);
        assert.ok(Number.isInteger(def.h) && def.h > 0, `${label} ${id}: h`);
        assert.ok(Array.isArray(def.frames) && def.frames.length > 0, `${label} ${id}: frames`);
        def.frames.forEach((frame, fi) => {
            assert.equal(frame.length, def.h, `${label} ${id} frame ${fi}: row count`);
            frame.forEach((row, ri) => {
                assert.equal(row.length, def.w, `${label} ${id} frame ${fi} row ${ri}: width`);
                for (const ch of row) {
                    if (ch === '.') continue;
                    assert.ok(ch in def.colors, `${label} ${id}: no colour for '${ch}'`);
                }
            });
        });
        for (const [ch, value] of Object.entries(def.colors)) {
            assert.ok(value in PAL || isHex(value), `${label} ${id}: bad colour ${ch}=${value}`);
        }
    }
}

test('art: every sprite frame is h rows of w chars with a colour per char', () => {
    checkShape(SPRITES, 'sprite');
});

test('art: every icon is 12x12 with a colour per char', () => {
    checkShape(ICONS, 'icon');
    for (const [id, def] of Object.entries(ICONS)) {
        assert.equal(def.w, 12, `icon ${id}: w`);
        assert.equal(def.h, 12, `icon ${id}: h`);
    }
});

test('art: every listed sprite and icon exists', () => {
    for (const id of SPRITE_IDS) assert.ok(SPRITES[id], `missing sprite ${id}`);
    for (const id of ICON_IDS) assert.ok(ICONS[id], `missing icon ${id}`);
    const grouped = Object.values(SPRITE_GROUPS).flat();
    assert.deepEqual([...grouped].sort(), Object.keys(SPRITES).sort(), 'SPRITE_GROUPS covers all');
    const icons = Object.values(ICON_GROUPS).flat();
    assert.deepEqual([...icons].sort(), Object.keys(ICONS).sort(), 'ICON_GROUPS covers all');
});

test('art: every sprite has a 1-px ink outline (no filled pixel on the border)', () => {
    for (const [id, def] of Object.entries(SPRITES)) {
        if (id === 'laser') continue; // tiling beam, authored without an outline
        for (const frame of def.frames) {
            const edge = [frame[0], frame[def.h - 1], ...frame.map((r) => r[0] + r[def.w - 1])];
            for (const line of edge)
                assert.match(line, /^[.o]*$/, `${id}: filled pixel on the sprite border`);
        }
    }
});

test('art: bakeSprite and bakeIcon return null under Node', () => {
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(bakeSprite('bull'), null);
    assert.equal(bakeSprite('bull', 3, { flip: true, tint: '#FFFFFF' }), null);
    assert.equal(bakeIcon('alpha', 2), null);
    assert.equal(bakeSprite('does_not_exist'), null);
});
