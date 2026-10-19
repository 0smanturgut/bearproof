// Feature clips for the trailer, filmed on the live build's living maps (4:5, 1080x1350), plus the wall stills of
// the nights after Build #25. Each clip is cut where its feature's own moment happens (FEATURES.from in timeline.js).
const LOUD = [
    'green_candle',
    'laser_eyes',
    'diamond_hands',
    'airdrop',
    'circuit_breaker',
    'horns',
    'buyback',
    'hopium',
    'conviction',
    'high_frequency',
    'leverage'
];
const run = () => async (a) => {
    await window.__dir.run(a.run);
    if (a.until) return window.__dir.until(a.until, a.max || 60, a.run);
    return window.__dir.summary();
};
const tick = () => window.__dir.tick();
const Z = { close: 4.0, near: 3.4, wide: 2.7 };
const L = 27;
const S = (o) => ({
    build: L,
    hud: false,
    setup: run(),
    tick,
    seconds: 2.5,
    css: '#toast,#mapCard,#hint{display:none!important}',
    ...o
});
const near = (id, r) =>
    `sim.enemies.some((e) => e.def && e.def.id === '${id}' && e.hp > 0 && Math.hypot(e.x - sim.player.x, e.y - sim.player.y) < ${r})`;
export function featShots() {
    return [
        S({
            id: 'f6',
            seed: 306,
            seconds: 3.0,
            args: { run: { stage: 'chop', at: 299.2, prefer: LOUD, zoom: Z.wide } }
        }),
        S({
            id: 'f12',
            seed: 312,
            seconds: 3.0,
            args: {
                run: { stage: 'bear_trap', at: 100, prefer: LOUD, zoom: Z.near, steer: 'crate' },
                until: "sim.crates.some((c) => !c.dead && c.loot === 'god_candle' && c.fall > 0 && c.fall < 1.4)",
                max: 900
            }
        }),
        S({
            id: 'f16',
            seed: 316,
            seconds: 2.5,
            args: {
                run: { stage: 'chop', at: 200, prefer: ['bear_spray', ...LOUD], zoom: Z.close },
                until: near('grizzly', 120),
                max: 400
            }
        }),
        S({
            id: 'f20',
            seed: 320,
            seconds: 3.0,
            args: { run: { stage: 'winter', at: 209.0, prefer: LOUD, zoom: Z.wide } }
        }),
        S({
            id: 'f23',
            seed: 323,
            seconds: 5.0,
            args: {
                run: { stage: 'winter', at: 100, prefer: LOUD, zoom: Z.near, steer: 'crate' },
                until: "sim.crates.some((c) => !c.dead && c.loot === 'moon_rocket' && c.fall > 0 && c.fall < 1.4)",
                max: 900
            }
        }),
        S({
            id: 'f24',
            seed: 324,
            seconds: 2.5,
            args: {
                run: { stage: 'bear_trap', at: 220, prefer: ['honey_trap', ...LOUD], zoom: Z.near },
                until: near('grizzly', 110),
                max: 400
            }
        }),
        S({
            id: 'f26',
            seed: 326,
            seconds: 2.5,
            args: {
                run: { stage: 'chop', at: 140, character: 'whale', prefer: LOUD, zoom: Z.near }
            }
        }),
        S({
            id: 'f27',
            seed: 327,
            seconds: 3.5,
            args: {
                run: { stage: 'eras', at: 235, prefer: LOUD, zoom: Z.wide },
                until: 'sim.time > 328.4 || sim.enemies.some((e) => e.boss && e.hp > 0 && e.hp < e.maxHp * 0.12)',
                max: 120
            }
        }),
        S({
            id: 'w26',
            build: 26,
            seed: 426,
            seconds: 0.05,
            warmup: 40,
            args: {
                run: { stage: 'bear_trap', at: 150, character: 'whale', prefer: LOUD, zoom: Z.near }
            }
        }),
        S({
            id: 'w27',
            seed: 427,
            seconds: 0.05,
            warmup: 40,
            args: { run: { stage: 'eras', at: 150, prefer: LOUD, zoom: Z.near } }
        })
    ];
}
