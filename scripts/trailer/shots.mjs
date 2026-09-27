// The footage the trailer cuts together. Every shot is one of the shipped builds (dist/b/<n>/), played by its
// own autopilot on a fixed seed and kept alive for the camera. `seconds` is what gets recorded; the timeline
// decides how much of it is used. Built from the data snapshot, so tomorrow's render films tomorrow's build.
//
// Functions here run inside the page (Playwright serialises them): they may only use their argument and the
// page's globals (window.__dir, window.__bearproof).

// Level-up picks for the showcase runs: the loud weapons first, so the screen is busy and readable.
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

// Zoom is device px per world unit at DSF 2 (the build's own default at 1280×720 is ~2.55).
const Z = { near: 3.6, close: 4.4, wide: 3.0 };

/** Tuned shots for the builds that exist today; any later build gets a generic mid-run shot. */
const EVO = {
    0: {
        seed: 11,
        seconds: 3.2,
        warmup: 330,
        ready: () => !!document.getElementById('btnStart'),
        setup: async () => {
            window.__dir.upstreamStart();
            return 'upstream';
        },
        tick: () => {
            window.__f = (window.__f || 0) + 1;
            if (window.__f === 2) window.__SURV_DEBUG__?.advance(70);
            window.__dir.upstreamTick(window.__f);
        }
    },
    1: { seed: 21, args: { run: { at: 118, prefer: LOUD, zoom: Z.near } } },
    2: { seed: 32, args: { run: { at: 178, prefer: LOUD, zoom: Z.near } } },
    3: {
        seed: 43,
        args: { run: { at: 128, character: 'pepe', prefer: ['tongue', ...LOUD], zoom: Z.near } }
    },
    4: {
        // A crate lands next to the bull and pops open on camera.
        seed: 54,
        seconds: 4.2,
        args: {
            run: { at: 96, prefer: LOUD, zoom: Z.near, steer: 'crate' },
            until: 'sim.crates.some((c) => !c.dead && c.fall > 0 && c.fall < 1.6)',
            max: 70
        }
    },
    5: { seed: 65, args: { run: { mode: 'daily', at: 150, prefer: LOUD, zoom: Z.near } } }
};

export function shotsFor(D) {
    const live = D.liveBuild.n;
    const evoBuilds = [D.builds[0], ...D.builds.slice(1).slice(-5)].map((b) => b.n);
    const shots = evoBuilds.map((n) => ({
        id: `b${n}`,
        build: n,
        seconds: 3.2,
        hud: true,
        setup: run(),
        tick,
        seed: 100 + n,
        args: {
            run: { mode: n === live ? 'daily' : 'free', at: 150, prefer: LOUD, zoom: Z.near }
        },
        ...(EVO[n] || {})
    }));
    const L = (o) => ({ build: live, hud: false, setup: run(), tick, seconds: 3.2, ...o });
    shots.push(
        // The live build's title screen: character pick, today's twist, the AI's bounty.
        {
            id: 'titleLive',
            build: live,
            seed: 66,
            seconds: 2.4,
            warmup: 40,
            setup: async () => 'title'
        },
        // The same, on a phone.
        {
            id: 'phoneTitle',
            build: live,
            seed: 67,
            seconds: 2.4,
            warmup: 40,
            viewport: { css: [390, 844], dsf: 3 },
            setup: async () => 'title'
        },
        // 0:00: the bull alone, then the opening bell rings six bears in.
        L({
            id: 'bell',
            seed: 71,
            seconds: 3.4,
            warmup: 0,
            args: { run: { at: 0, zoom: Z.close } }
        }),
        // Late game: a full loadout against a crowd (and Capitulation arriving at 7:30).
        L({
            id: 'chaos',
            seed: 72,
            seconds: 4.2,
            args: { run: { at: 448.6, stage: 'chop', prefer: LOUD, zoom: Z.near } }
        }),
        L({
            id: 'chaos2',
            css: '#toast{display:none!important}',
            seed: 73,
            args: { run: { at: 560, prefer: LOUD, zoom: Z.wide } }
        }),
        // Between bosses (Chop Zone: 7:30 and 10:00), so no boss card crosses the one-liner.
        L({
            id: 'chaos3',
            css: '#toast{display:none!important}',
            seed: 81,
            args: { run: { at: 522, stage: 'chop', prefer: LOUD, zoom: Z.near } }
        }),
        L({
            id: 'pepe',
            css: '#toast{display:none!important}',
            seed: 74,
            args: {
                run: { at: 205, character: 'pepe', prefer: ['tongue', ...LOUD], zoom: Z.close }
            }
        }),
        L({
            id: 'crate',
            seed: 90,
            seconds: 4.2,
            args: {
                run: { at: 156, prefer: LOUD, zoom: Z.close, steer: 'crate' },
                until: 'sim.crates.some((c) => !c.dead && c.fall > 0 && c.fall < 1.6)',
                max: 70
            }
        }),
        // The level-up cards, as a player sees them.
        L({
            id: 'levelup',
            seed: 76,
            seconds: 2.2,
            hud: true,
            warmup: 0,
            setup: async (a) => {
                await window.__dir.run(a.run);
                await window.__dir.until('sim.choices', 30);
                window.__bearproof.game._openLevelUp();
                return window.__dir.summary();
            },
            args: { run: { at: 64, prefer: LOUD, zoom: Z.near, autoPick: false } }
        }),
        // Chop Zone bosses: Rug Lord 5:00, Liquidation 10:00, The Bear Market 12:00.
        L({
            id: 'rug',
            seed: 77,
            seconds: 4.4,
            args: { run: { at: 298.3, stage: 'chop', prefer: LOUD, zoom: Z.near } }
        }),
        L({
            id: 'liq',
            seed: 78,
            seconds: 4.4,
            args: { run: { at: 598.3, stage: 'chop', prefer: LOUD, zoom: Z.wide } }
        }),
        L({
            id: 'bm',
            seed: 79,
            seconds: 4.4,
            args: { run: { at: 718.3, stage: 'chop', prefer: LOUD, zoom: Z.wide } }
        }),
        // A run that ends for real (no camera help): the receipt and the share button.
        L({
            id: 'over',
            seed: 80,
            seconds: 3.4,
            hud: true,
            warmup: 0,
            tick: undefined,
            setup: async (a) => {
                await window.__dir.run(a.run);
                return window.__dir.until('sim.over', 900);
            },
            args: { run: { at: 0, heal: false, stage: 'chop', prefer: LOUD, zoom: Z.near } }
        })
    );
    return shots;
}
