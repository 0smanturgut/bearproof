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

test('art: every icon is 16x16 with a colour per char', () => {
    checkShape(ICONS, 'icon');
    for (const [id, def] of Object.entries(ICONS)) {
        assert.equal(def.w, 16, `icon ${id}: w`);
        assert.equal(def.h, 16, `icon ${id}: h`);
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

// Outlines are selective (the darkest hue of the material they wrap), so "ink" means very dark.
const lum = (hex) => {
    const v = parseInt(hex.slice(1), 16);
    return (0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
};

test('art: every sprite is outlined (only transparent or dark outline pixels on the border)', () => {
    for (const [id, def] of Object.entries(SPRITES)) {
        if (id === 'laser') continue; // tiling beam, authored without an outline
        for (const frame of def.frames) {
            const edge = [frame[0], frame[def.h - 1], ...frame.map((r) => r[0] + r[def.w - 1])];
            for (const line of edge)
                for (const ch of line) {
                    if (ch === '.' || ch === 'o') continue;
                    assert.ok(
                        lum(def.colors[ch]) < 0.16,
                        `${id}: bright pixel ${def.colors[ch]} on the border`
                    );
                }
        }
    }
});

test('art: sprites carry an animation and glow where it matters', () => {
    for (const id of ['bull', 'red_candle', 'grizzly', 'bear_market']) {
        assert.ok(SPRITES[id].frames.length >= 4, `${id}: animated`);
        assert.ok(SPRITES[id].fps > 0, `${id}: fps`);
    }
    for (const id of ['red_candle', 'xp_candle', 'bear_market', 'long_winter'])
        assert.ok(SPRITES[id].glowFrames, `${id}: glows`);
});

test('art: bakeSprite and bakeIcon return null under Node', () => {
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(bakeSprite('bull'), null);
    assert.equal(bakeSprite('bull', 3, { flip: true, tint: '#FFFFFF' }), null);
    assert.equal(bakeIcon('alpha', 2), null);
    assert.equal(bakeSprite('does_not_exist'), null);
});
