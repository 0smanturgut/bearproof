/**
 * @module game
 * @description The client shell around the simulation: fixed-step loop, input → move code → sim,
 * sim events → effects/audio/haptics/UI, level-up cards, run recording and score submission.
 * Also runs "attract mode" (an autopilot playing the live build), used by the HQ preview.
 */

import { Simulation } from './sim/sim.js';
import { SIM } from './sim/content.js';
import { encodeMove } from './sim/input-codes.js';
import { RunRecorder, toBase64Url } from './sim/runlog.js';
import { createBot } from './sim/bot.js';
import { Fx } from './fx.js';
import { KILL_COLORS, Renderer } from './render.js';
import { fmtNum, fmtTime } from './format.js';
import { share, shareText } from './share.js';
import * as api from './api.js';
import { cleanName, playerId, savePrefs } from './prefs.js';

const STEP = SIM.DT;
const MAX_STEPS_PER_FRAME = 5;

export class Game {
    constructor({ canvas, ui, input, audio, haptics, prefs, build, attract = false }) {
        this.ui = ui;
        this.input = input;
        this.audio = audio;
        this.haptics = haptics;
        this.prefs = prefs;
        this.build = build;
        this.attract = attract;
        this.renderer = new Renderer(canvas);
        this.fx = new Fx(prefs);
        this.state = 'title';
        this.sim = new Simulation({ seed: 1 });
        this.cam = { x: 0, y: 0 };
        this.acc = 0;
        this.last = 0;
        this.clock = 0;
        this.daily = null;
        this.mode = 'free';
        this.rec = null;
        this.bot = null;
        this._sfxAt = {};
        this._runId = 0;
        window.addEventListener('resize', () => this.renderer.resize());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.state === 'playing') this.pause();
        });
        requestAnimationFrame((t) => this._frame(t));
    }

    // --- Run lifecycle ----------------------------------------------------------

    startRun(mode) {
        this.mode = mode === 'daily' && this.daily ? 'daily' : 'free';
        const seed = this.mode === 'daily' ? this.daily.seed : randomSeed();
        this.sim = new Simulation({ seed });
        this.rec = new RunRecorder(seed);
        this.bot = this.attract ? createBot({ phase: Math.floor(Math.random() * 1000) }) : null;
        this.fx.clear();
        this.cam.x = 0;
        this.cam.y = 0;
        this.acc = 0;
        this.startedAt = performance.now();
        this.submitted = false;
        this._bossIntro = null;
        this._runId++;
        this.ui.resetHud();
        this.ui.hideAll();
        this.input.reset();
        this.state = this.attract ? 'attract' : 'playing';
        if (!this.attract) {
            this.audio.unlock();
            this.audio.startMusic();
            this.ui.moveHint(true);
            clearTimeout(this._hintTimer);
            this._hintTimer = setTimeout(() => this.ui.moveHint(false), 4000);
            api.startSession(playerId(), this.build.n, this.mode);
        }
    }

    pause() {
        if (this.state !== 'playing') return;
        this.state = 'paused';
        this.audio.stopMusic();
        this.input.reset();
        const sub = document.getElementById('pauseSub');
        sub.textContent = `${this.mode === 'daily' ? `Daily ${this.daily.date}` : 'Free run'} · ${fmtTime(this.sim.timeMs)} · score ${fmtNum(this.sim.stats.score)}`;
        this.ui.show('screenPause');
    }

    resume() {
        if (this.state !== 'paused') return;
        this.state = 'playing';
        this.acc = 0;
        this.last = performance.now();
        this.audio.startMusic();
        this.ui.hideAll();
    }

    togglePause() {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
    }

    quitToTitle() {
        this.state = 'title';
        this.audio.stopMusic();
        this.ui.moveHint(false);
        this.ui.show('screenTitle');
    }

    // --- Loop -----------------------------------------------------------------

    _frame(now) {
        const dt = Math.min(0.1, Math.max(0, (now - (this.last || now)) / 1000));
        this.last = now;
        this.clock += dt;
        this.input.pollGamepad((b) => this._padButton(b));

        const running = this.state === 'playing' || this.state === 'attract';
        if (running) {
            this.acc += dt;
            let steps = 0;
            while (this.acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
                // Never record a tick the sim won't simulate: the log must match the run exactly.
                if (this.sim.choices || this.sim.over) break;
                const code = this.bot
                    ? this.bot.move(this.sim)
                    : encodeMove(...xy(this.input.move()));
                this.rec.tick(code);
                this.sim.step(code);
                this._events(this.sim.drainEvents());
                this.acc -= STEP;
                steps++;
                if (this.sim.over) break;
            }
            if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
            if (this.sim.choices) this._openLevelUp();
            if (this.sim.over && (this.state === 'playing' || this.state === 'attract'))
                this._endRun();
        }
        if (this.state !== 'paused') this.fx.update(dt);

        const p = this.sim.player;
        const follow = Math.min(1, dt * 9);
        this.cam.x += (p.x - this.cam.x) * follow;
        this.cam.y += (p.y - this.cam.y) * follow;
        this.renderer.draw(this.sim, this.fx, this.cam, this.clock);
        if (this.state !== 'title') this.ui.updateHud(this.sim);
        requestAnimationFrame((t) => this._frame(t));
    }

    _padButton(b) {
        if (b === 9 || b === 8) this.togglePause();
        else if (this.state === 'levelup' && b <= 2) this.ui.levelKey(String(b + 1));
    }

    // --- Level-up -------------------------------------------------------------

    _openLevelUp() {
        const choices = this.sim.choices;
        if (!choices) return;
        if (this.attract) {
            this.state = 'attract-pick';
            setTimeout(() => {
                if (this.state !== 'attract-pick') return;
                this._choose(this.bot.pick(this.sim));
                this.state = 'attract';
            }, 500);
            return;
        }
        this.state = 'levelup';
        this.input.reset();
        this.ui.showLevelUp(this.sim.player.level, choices, (i) => {
            this._choose(i);
            if (this.sim.choices) this._openLevelUp();
            else {
                this.state = 'playing';
                this.acc = 0;
                this.ui.hideAll();
                if (this._bossIntro) {
                    this.ui.bossIntro(this._bossIntro.name, this._bossIntro.tagline);
                    this._bossIntro = null;
                }
            }
        });
    }

    _choose(i) {
        this.rec.pick(this.sim.tick, i);
        this.sim.choose(i);
        this._events(this.sim.drainEvents());
    }

    // --- Events → juice -------------------------------------------------------

    _sfx(name, gap = 0.05) {
        if (this.attract) return;
        const t = this.clock;
        if ((this._sfxAt[name] || -1) > t - gap) return;
        this._sfxAt[name] = t;
        this.audio[name]?.();
    }

    _events(events) {
        const fx = this.fx;
        const p = this.sim.player;
        for (const e of events) {
            switch (e.t) {
                case 'dmg':
                    fx.number(e.x, e.y, e.v, e.crit ? 'crit' : 'dmg');
                    if (e.crit) fx.burst(e.x, e.y, '#FFC53D', 4, 140, 3);
                    this._sfx('hit', 0.045);
                    break;
                case 'kill':
                    fx.burst(
                        e.x,
                        e.y,
                        KILL_COLORS[e.id] || '#FF3B5C',
                        e.boss ? 46 : 9,
                        e.boss ? 320 : 170,
                        e.boss ? 7 : 4
                    );
                    if (e.boss) {
                        fx.addShake(1);
                        fx.addFlash('255,197,61', 0.35, 1.5);
                        this._sfx('explosion', 0);
                    }
                    break;
                case 'hurt':
                    fx.number(p.x, p.y - 34, e.v, 'hurt');
                    fx.vignette = 1;
                    fx.addShake(0.35);
                    this._sfx('damage', 0.1);
                    if (!this.attract) this.haptics.hurt();
                    break;
                case 'dodge':
                    fx.number(e.x, e.y - 36, 'SLIPPED', 'info');
                    break;
                case 'pickup':
                    this._sfx('pickup', 0.06);
                    break;
                case 'levelup':
                    fx.ring(p.x, p.y, 10, 140, 0.45, '255,197,61', 4);
                    fx.addFlash('255,197,61', 0.22, 2.5);
                    this._sfx('levelUp', 0);
                    if (!this.attract) this.haptics.levelUp();
                    break;
                case 'evolve':
                    this.ui.toast('EVOLVED', 'gold', 1200);
                    fx.addFlash('255,197,61', 0.3, 2);
                    break;
                case 'bossWarn':
                    this._sfx('bossWarn', 0);
                    if (!this.attract) this.ui.toast(`${e.name.toUpperCase()} IN 5`, 'bear', 1600);
                    break;
                case 'boss':
                    // If a level-up card opens on the same tick, hold the intro until it closes.
                    if (this.sim.choices) this._bossIntro = e;
                    else if (!this.attract) this.ui.bossIntro(e.name, e.tagline);
                    fx.addShake(1.1);
                    fx.addFlash('255,59,92', 0.45, 1.4);
                    this._sfx('bossSpawn', 0);
                    if (!this.attract) this.haptics.bossSpawn();
                    break;
                case 'bossDown':
                    if (!this.attract) this.ui.toast(`${e.name.toUpperCase()} REKT`, 'bull', 1800);
                    break;
                case 'fire':
                    if (e.w === 'horns') fx.swipe(e.x, e.y, e.r, e.evolved);
                    else if (e.w === 'circuit_breaker')
                        fx.ring(e.x, e.y, 20, e.r, 0.32, '70,200,255', 5);
                    this._sfx('shoot', 0.09);
                    break;
                case 'strike':
                    fx.drop(e.x, e.y);
                    break;
                case 'chain':
                    fx.line(e.x1, e.y1, e.x2, e.y2, 0.16, '255,197,61', 3, true);
                    break;
                case 'tether':
                    fx.line(e.x1, e.y1, e.x2, e.y2, 0.12, '22,224,138', 2.5, true);
                    break;
                case 'explode':
                    fx.ring(e.x, e.y, 10, e.r, 0.3, '255,140,60', 5);
                    fx.burst(e.x, e.y, '#FF8C3C', 12, 220, 5);
                    fx.addShake(0.25);
                    this._sfx('explosion', 0.08);
                    break;
                case 'clone':
                    fx.burst(e.x, e.y, '#B8C0CC', 10, 160, 4);
                    break;
                case 'summon':
                    fx.ring(e.x, e.y, 10, 90, 0.35, '255,59,92', 4);
                    break;
                case 'charge':
                    fx.addShake(0.3);
                    break;
                case 'cold':
                    fx.number(e.x, e.y - 34, `-${e.v} COLD`, 'hurt');
                    break;
                case 'wave':
                    if (!this.attract && this.sim.tick > 60)
                        this.ui.toast(e.label.toUpperCase(), 'gold', 1500);
                    break;
            }
        }
    }

    // --- End of run -------------------------------------------------------------

    _endRun() {
        const summary = this.sim.summary();
        if (this.attract) {
            this.state = 'attract-over';
            setTimeout(() => this.startRun('free'), 2500);
            return;
        }
        this.state = 'over';
        this.audio.stopMusic();
        this.audio.death();
        this.haptics.gameOver();
        this.ui.moveHint(false);
        this.fx.addShake(0.8);
        this.lastRun = {
            summary,
            mode: this.mode,
            date: this.daily?.date,
            bytes: this.rec.toBytes(),
            durationMs: Math.round(performance.now() - this.startedAt),
            runId: this._runId
        };
        const title = summary.won
            ? 'BEAR MARKET OVER'
            : summary.reason === 'market_closed'
              ? 'MARKET CLOSED'
              : 'LIQUIDATED';
        const sub = summary.won
            ? `You ended the bear market in ${fmtTime(summary.timeMs)}.`
            : `Your bull run lasted ${fmtTime(summary.timeMs)}.`;
        const buildLine = `${this.mode === 'daily' ? `Daily Challenge ${this.daily.date}` : 'Free run'} · Build #${this.build.n}`;
        setTimeout(() => this.ui.showOver({ summary, title, sub, buildLine }), 700);
        setTimeout(() => this._maybeSubmit(), 750);
    }

    _rankable() {
        return (
            this.mode === 'daily' && this.daily && String(this.daily.build) === String(this.build.n)
        );
    }

    _maybeSubmit() {
        const run = this.lastRun;
        if (!run || this.submitted) return;
        if (!this._rankable()) {
            this.ui.setRank(
                this.mode === 'daily'
                    ? 'Practice run: this build is not the one today’s board is pinned to.'
                    : 'Free runs are for fun. Play today’s challenge to get on the board.'
            );
            return;
        }
        if (!this.prefs.name) {
            this.ui.askName('', (name) => {
                this.prefs.name = cleanName(name);
                savePrefs(this.prefs);
                this._submit(run);
            });
            this.ui.setRank('Put a name on it, or leave it blank to stay anon.');
            return;
        }
        this._submit(run);
    }

    async _submit(run) {
        if (this.submitted) return;
        this.submitted = true;
        this.ui.setRank('Submitting to the board…');
        const s = run.summary;
        const res = await api.submitRun({
            v: 1,
            playerId: playerId(),
            name: this.prefs.name || null,
            mode: run.mode,
            challengeDate: run.date,
            build: this.build.n,
            seed: this.sim.seed,
            stage: s.stage,
            claimed: { score: s.score, timeMs: s.timeMs, kills: s.kills, level: s.level },
            durationMs: run.durationMs,
            log: toBase64Url(run.bytes)
        });
        if (run.runId !== this._runId) return;
        if (res.ok && res.data?.ok) {
            const rank = res.data.rank;
            this.lastRun.id = res.data.id;
            this.ui.setRank(
                rank
                    ? `#${rank} on today’s board · verification pending`
                    : 'Submitted · verification pending'
            );
        } else if (res.status === 0) {
            this.ui.setRank('Offline: could not reach the board.');
        } else {
            this.ui.setRank(`Not ranked: ${res.data?.error?.message || `error ${res.status}`}`);
        }
    }

    async shareLast() {
        const run = this.lastRun;
        if (!run) return;
        const out = await share(
            shareText({
                summary: run.summary,
                mode: run.mode,
                date: run.date,
                build: this.build.n,
                origin: location.origin
            })
        );
        if (out === 'copied') this.ui.setRank('Copied. Paste it anywhere.');
    }
}

function xy(v) {
    return [v.x, v.y];
}

function randomSeed() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        return crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    }
    return (Math.random() * 0xffffffff) >>> 0 || 1;
}
