// Runs inside a build's page (injected after it boots). Sets up a scene with the build's own code: a run on its
// own autopilot, fast-forwarded with recorded input (like the smoke test), kept alive for the camera, with a
// closer camera if asked. Logs the game's own SFX calls so the soundtrack can play them in sync.
window.__dir = (() => {
    const G = () => window.__bearproof.game;
    const base = location.pathname.replace(/\/[^/]*$/, '');
    const mods = {};
    const mod = async (name) => (mods[name] ||= await import(`${base}/src/${name}`));
    const SFX = [
        'hit',
        'shoot',
        'tongue',
        'explosion',
        'pickup',
        'levelUp',
        'damage',
        'death',
        'bossSpawn',
        'bossWarn',
        'airdrop',
        'thud',
        'crate',
        'achievement'
    ];
    let heal = false;
    let hooks = [];

    function logSfx(g) {
        for (const n of SFX) {
            const f = g.audio?.[n];
            if (typeof f !== 'function' || f.__logged) continue;
            const w = function (...a) {
                (window.__sfxLog ||= []).push({ t: performance.now(), n });
                return f.apply(this, a);
            };
            w.__logged = true;
            g.audio[n] = w;
        }
    }

    function pickFor(g, prefer, bot) {
        const ch = g.sim.choices || [];
        for (const id of prefer || []) {
            const i = ch.findIndex((c) => c.id === id);
            if (i >= 0) return i;
        }
        return bot?.pick ? bot.pick(g.sim) : 0;
    }

    return {
        /**
         * o: { mode, character, at (sim seconds), heal, prefer [card ids], zoom (device px per world unit),
         *      style, steer ('crate') }
         */
        async run(o = {}) {
            const g = G();
            const { createBot } = await mod('sim/bot.js');
            const { encodeMove } = await mod('sim/input-codes.js');
            logSfx(g);
            if (o.character && g.prefs) g.prefs.character = o.character;
            g.startRun(o.mode || 'free');
            if (o.stage) {
                // Same seed, chosen stage (a free run's stage otherwise follows its random seed).
                const { Simulation } = await mod('sim/sim.js');
                g.sim = new Simulation({
                    seed: g.sim.seed,
                    stage: o.stage,
                    character: o.character || g.prefs?.character || null
                });
            }
            const ff = createBot({ style: o.style || 'survive' });
            heal = o.heal !== false;
            if (heal) {
                // Kept alive for the camera: hits still land (flash, number), the run just never ends.
                const p = g.sim.player;
                const take = p.takeDamage.bind(p);
                p.takeDamage = (d, sim) => {
                    take(d, sim);
                    p.dead = false;
                    p.hp = Math.max(p.hp, 1);
                };
            }
            while (g.sim.time < (o.at || 0) && !g.sim.over) {
                if (heal) g.sim.player.hp = g.sim.player.maxHp;
                if (g.sim.choices) {
                    const i = pickFor(g, o.prefer, ff);
                    g.rec.pick(g.sim.tick, i);
                    g.sim.choose(i);
                    continue;
                }
                const code = ff.move(g.sim);
                g.rec.tick(code);
                g.sim.step(code);
                g.sim.drainEvents();
            }
            const live = createBot({ style: o.style || 'survive' });
            // A director on top of the autopilot: walk to the next landed crate when asked.
            g.bot = {
                move(sim) {
                    if (o.steer === 'crate' && sim.crates?.length) {
                        const p = sim.player;
                        const c = sim.crates.find((k) => !k.dead);
                        if (c && c.fall < 0.9) {
                            const dx = c.x - p.x;
                            const dy = c.y - p.y;
                            const d = Math.hypot(dx, dy) || 1;
                            return encodeMove(dx / d, dy / d);
                        }
                    }
                    return live.move(sim);
                },
                pick: (sim) => pickFor({ sim }, o.prefer, live)
            };
            if (o.autoPick !== false) {
                g._openLevelUp = () => {
                    while (g.sim.choices) g._choose(pickFor(g, o.prefer, live));
                };
            }
            g.ui.moveHint?.(false);
            clearTimeout(g._hintTimer);
            if (o.zoom) this.zoom(o.zoom);
            // Snap the camera onto the bull so the first kept frame is framed.
            const p = g.sim.player;
            g.cam.x = p.x;
            g.cam.y = p.y;
            g._lead = null;
            return this.summary();
        },

        /** Fast-forward (recorded input, no juice) until `cond(sim)` or `max` seconds. */
        async until(cond, max = 60, o = {}) {
            const g = G();
            const { createBot } = await mod('sim/bot.js');
            const ff = createBot({ style: 'survive' });
            const f = new Function('sim', `return (${cond})`);
            const end = g.sim.time + max;
            while (!f(g.sim) && g.sim.time < end && !g.sim.over) {
                if (heal) g.sim.player.hp = g.sim.player.maxHp;
                if (g.sim.choices) {
                    const i = pickFor(g, o.prefer, ff);
                    g.rec.pick(g.sim.tick, i);
                    g.sim.choose(i);
                    continue;
                }
                const code = ff.move(g.sim);
                g.rec.tick(code);
                g.sim.step(code);
                g.sim.drainEvents();
            }
            const p = g.sim.player;
            g.cam.x = p.x;
            g.cam.y = p.y;
            g._lead = null;
            return this.summary();
        },

        zoom(s) {
            const r = G().renderer;
            r.s = s;
            r.k = Math.max(1, Math.round(2 * s));
            r._cache = {};
        },

        /** Called before every frame. */
        tick() {
            const g = window.__bearproof?.game;
            if (heal && g?.sim?.player) g.sim.player.hp = g.sim.player.maxHp;
            for (const h of hooks) h(g);
        },

        hook(fn) {
            hooks.push(fn);
        },

        summary() {
            const g = G();
            const s = g.sim;
            return {
                time: +s.time.toFixed(2),
                level: s.player.level,
                enemies: s.enemies.length,
                bosses: s.enemies.filter((e) => e.boss).map((e) => e.id),
                weapons: s.player.weapons.map((w) => `${w.id}:${w.level}`),
                score: s.stats?.score,
                crates: s.crates?.map((c) => ({ loot: c.loot, fall: +c.fall.toFixed(2) }))
            };
        },

        // ---- Build #0: the untouched upstream game, driven like a player with a keyboard.
        upstreamStart() {
            document.getElementById('howtoClose')?.click();
            document.getElementById('tutorialOffer')?.remove();
            document.getElementById('btnStart')?.click();
            document.getElementById('tutorialOffer')?.remove();
        },
        upstreamTick(frame) {
            const keys = ['d', 's', 'a', 'w'];
            const period = 42;
            if (frame % period === 0) {
                const k = keys[Math.floor(frame / period) % 4];
                const prev = keys[(Math.floor(frame / period) + 3) % 4];
                document.body.dispatchEvent(
                    new KeyboardEvent('keyup', { key: prev, bubbles: true })
                );
                document.body.dispatchEvent(
                    new KeyboardEvent('keydown', { key: k, bubbles: true })
                );
            }
            document.querySelector('.upgrade-option')?.click();
            document.getElementById('tutorialOffer')?.remove();
        }
    };
})();
