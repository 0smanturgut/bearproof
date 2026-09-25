/**
 * @module game
 * @description The client shell around the simulation: fixed-step loop, input → move code → sim,
 * sim events → effects/audio/haptics/UI, level-up cards, run recording and score submission.
 * Also runs "attract mode" (an autopilot playing the live build), used by the HQ preview.
 */

import { Simulation } from './sim/sim.js';
import { BOSSES, CRATE_LOOT, ENEMIES, SIM } from './sim/content.js';
import { encodeMove } from './sim/input-codes.js';
import { RunRecorder, toBase64Url } from './sim/runlog.js';
import { CHARACTER_IDS, TWISTS, dailyTwistForSeed } from './sim/content.js';
import { createBot } from './sim/bot.js';
import { Fx } from './fx.js';
import { KILL_COLORS, Renderer } from './render.js';

// enemy id -> sprite id, for the shatter effect on death
const ENEMY_SPRITE = Object.fromEntries(
    [...Object.values(ENEMIES), ...Object.values(BOSSES)].map((d) => [d.id, d.sprite || d.id])
);
import { fmtNum, fmtTime } from './format.js';
import {
    canNativeShare,
    copyText,
    fetchCard,
    nativeShare,
    shareText,
    xIntentUrl
} from './share.js';
import * as api from './api.js';
import { cleanName, playerId, savePrefs } from './prefs.js';
import { turnstileToken } from './turnstile.js';

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
        this.baseAttract = attract;
        this.backdrop = false;
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
        this._attractGen = 0;
        this._attractRuns = 0;
        window.addEventListener('resize', () => this.renderer.resize());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.state === 'playing') this.pause();
        });
        requestAnimationFrame((t) => this._frame(t));
    }

    // --- Run lifecycle ----------------------------------------------------------

    /** Title screen: the autopilot plays a free run behind the menu (no sound, no submit). */
    startBackdrop() {
        this.startRun('free', { backdrop: true });
        this.ui.show('screenTitle');
    }

    startRun(mode, { backdrop = false } = {}) {
        this.backdrop = backdrop;
        this.attract = this.baseAttract || backdrop;
        this.mode = mode === 'daily' && this.daily ? 'daily' : 'free';
        const seed = this.mode === 'daily' ? this.daily.seed : randomSeed();
        // The Daily Challenge has one twist, the same for everyone; free runs have none.
        const twist = this.mode === 'daily' ? dailyTwistForSeed(seed) : null;
        // The chosen character is part of the run log, so the server re-simulates it too. The HQ/stream autopilot
        // takes turns through the characters, newest first, so the preview shows what's new; the title backdrop
        // plays the player's pick.
        const character = this.baseAttract
            ? CHARACTER_IDS[CHARACTER_IDS.length - 1 - (this._attractRuns++ % CHARACTER_IDS.length)]
            : this.prefs.character || null;
        this.sim = new Simulation({ seed, twist, character });
        this.rec = new RunRecorder(seed, twist, this.sim.characterId);
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
            if (twist) this.ui.toast(`TWIST: ${TWISTS[twist].name.toUpperCase()}`, 'gold', 2200);
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
        this.audio.stopMusic();
        this.ui.moveHint(false);
        this.startBackdrop();
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
        // Look a little ahead of the bull, in the direction it is running.
        const lead = this._lead || (this._lead = { x: 0, y: 0, px: p.x, py: p.y });
        if (dt > 0) {
            const vx = (p.x - lead.px) / dt;
            const vy = (p.y - lead.py) / dt;
            const kk = Math.min(1, dt * 2.5);
            lead.x += (Math.max(-60, Math.min(60, vx * 0.22)) - lead.x) * kk;
            lead.y += (Math.max(-45, Math.min(45, vy * 0.18)) - lead.y) * kk;
        }
        lead.px = p.x;
        lead.py = p.y;
        const follow = Math.min(1, dt * 9);
        this.cam.x += (p.x + lead.x - this.cam.x) * follow;
        this.cam.y += (p.y + lead.y - this.cam.y) * follow;
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
                    this.ui.bossIntro(
                        this._bossIntro.name,
                        this._bossIntro.tagline,
                        this._bossIntro.id
                    );
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
                    fx.sparks(e.x, e.y + 8, e.crit ? '#FFC53D' : '#FFFFFF', e.crit ? 5 : 2);
                    if (e.crit) fx.addKick(0.15);
                    this._sfx('hit', 0.045);
                    break;
                case 'kill': {
                    const def = ENEMY_SPRITE[e.id] || e.id;
                    fx.shatter(e.x, e.y, def, { big: e.boss, flip: Math.random() < 0.5 });
                    fx.burst(
                        e.x,
                        e.y,
                        KILL_COLORS[e.id] || '#FF3B5C',
                        e.boss ? 40 : 7,
                        e.boss ? 320 : 170,
                        e.boss ? 6 : 3.5
                    );
                    fx.burst(
                        e.x,
                        e.y + 10,
                        'rgba(120,130,150,',
                        e.boss ? 14 : 3,
                        70,
                        e.boss ? 14 : 7,
                        'smoke'
                    );
                    if (e.boss) {
                        fx.ring(e.x, e.y, 20, 260, 0.6, '255,197,61', 8, true);
                        fx.burst(e.x, e.y, '#FFC53D', 30, 420, 3, 'spark');
                        fx.addShake(1);
                        fx.addFlash('255,197,61', 0.4, 1.4);
                        this._sfx('explosion', 0);
                    }
                    break;
                }
                case 'hurt':
                    fx.number(p.x, p.y - 34, e.v, 'hurt');
                    fx.vignette = 1;
                    fx.addShake(0.35);
                    fx.addKick(0.5);
                    fx.sparks(p.x, p.y, '#FF7E86', 6);
                    this._sfx('damage', 0.1);
                    if (!this.attract) this.haptics.hurt();
                    break;
                case 'dodge':
                    fx.number(e.x, e.y - 36, 'SLIPPED', 'info');
                    break;
                case 'pickup':
                    fx.ping(p.x, p.y + 4, e.v >= 50 ? '255,197,61' : '22,224,138');
                    this._sfx('pickup', 0.06);
                    break;
                case 'levelup':
                    fx.ring(p.x, p.y, 10, 170, 0.5, '255,197,61', 6, true);
                    fx.burst(p.x, p.y, '#FFE08A', 18, 300, 3, 'spark');
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
                    else if (!this.attract) this.ui.bossIntro(e.name, e.tagline, e.id);
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
                    else if (e.w === 'circuit_breaker') {
                        fx.ring(e.x, e.y, 20, e.r, 0.36, '70,184,240', 7, true);
                        fx.burst(e.x, e.y, '#BDEEFF', 14, e.r * 2, 3, 'spark');
                    }
                    this._sfx(e.w === 'tongue' ? 'tongue' : 'shoot', 0.09);
                    break;
                case 'tongue':
                    fx.line(e.x1, e.y1 - 8, e.x2, e.y2, 0.14, '255,110,156', e.evolved ? 5 : 4);
                    fx.burst(e.x2, e.y2, '#FFA3C0', 6, 120, 3, 'spark');
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
                    fx.ring(e.x, e.y, 10, e.r, 0.32, '255,140,60', 7, true);
                    fx.burst(e.x, e.y, '#FFB35C', 14, 260, 3, 'spark');
                    fx.burst(e.x, e.y, '#FF8C3C', 8, 160, 5, 'ember');
                    fx.burst(e.x, e.y, 'rgba(90,80,80,', 6, 80, 12, 'smoke');
                    fx.addShake(0.25);
                    this._sfx('explosion', 0.08);
                    break;
                case 'clone':
                    fx.burst(e.x, e.y, '#B8C0CC', 8, 160, 3);
                    fx.burst(e.x, e.y, 'rgba(180,190,205,', 5, 60, 10, 'smoke');
                    break;
                case 'summon':
                    fx.ring(e.x, e.y, 10, 110, 0.4, '255,59,92', 6, true);
                    fx.burst(e.x, e.y, '#FF3B5C', 16, 240, 3, 'spark');
                    break;
                case 'charge':
                    fx.addShake(0.3);
                    break;
                case 'cold':
                    fx.number(e.x, e.y - 34, `-${e.v} COLD`, 'hurt');
                    break;
                case 'crateDrop':
                    this._sfx('airdrop', 0);
                    if (!this.attract) this.ui.toast('AIRDROP INCOMING', 'bull', 1400);
                    break;
                case 'crateLand':
                    fx.burst(e.x, e.y + 8, 'rgba(160,150,140,', 6, 90, 9, 'smoke');
                    fx.ring(e.x, e.y, 8, 50, 0.3, '22,224,138', 3);
                    fx.addShake(0.15);
                    this._sfx('thud', 0);
                    break;
                case 'crate': {
                    const loot = CRATE_LOOT[e.id];
                    const rgb =
                        e.id === 'shield'
                            ? '70,184,240'
                            : e.id === 'printer'
                              ? '255,197,61'
                              : '22,224,138';
                    const hex =
                        e.id === 'shield' ? '#9BE2FF' : e.id === 'printer' ? '#FFE08A' : '#7BF5A6';
                    fx.shatter(e.x, e.y, 'supply_crate');
                    fx.burst(e.x, e.y, '#C88645', 10, 200, 3.5);
                    fx.burst(p.x, p.y, hex, 22, 320, 3, 'spark');
                    fx.ring(p.x, p.y, 10, 150, 0.45, rgb, 6, true);
                    fx.addFlash(rgb, 0.25, 2.5);
                    fx.number(p.x, p.y - 40, loot.name.toUpperCase(), 'info');
                    this._sfx('crate', 0);
                    if (!this.attract) {
                        this.ui.toast(loot.toast, 'gold', 1800);
                        this.haptics.levelUp();
                    }
                    break;
                }
                case 'crateGone':
                    fx.burst(e.x, e.y, 'rgba(255,59,92,', 6, 70, 10, 'smoke');
                    fx.number(e.x, e.y - 20, 'LOOTED BY BEARS', 'info');
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
            const backdrop = this.backdrop;
            const id = ++this._attractGen;
            setTimeout(
                () => {
                    if (id !== this._attractGen || this.state !== 'attract-over') return;
                    if (backdrop) this.startBackdrop();
                    else this.startRun('free');
                },
                backdrop ? 1500 : 2500
            );
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
            seed: this.sim.seed,
            runId: this._runId,
            id: null,
            card: null
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
        // The run goes to the board right away. A name and a prize address are optional extras.
        this._submit(run);
        if (!this.prefs.nameAsked) this.ui.askName(this.prefs.name, (name) => this._saveName(name));
        this._offerPayout();
    }

    _offerPayout() {
        if (this.prefs.payoutAddress) {
            this.ui.payoutSaved(this.prefs.payoutAddress, () => this._askPayout());
            return;
        }
        this._askPayout();
    }

    _askPayout() {
        const prize = this.daily?.prize;
        // The server words the not-yet-live state (coin not out, or prize wallet not funded yet).
        this.ui.askPayout(
            this.prefs.payoutAddress || '',
            prize?.status === 'live'
                ? 'Today’s verified #1 wins the daily prize in $ANSEM. Add your Solana address:'
                : `${prize?.note || 'The daily $ANSEM prize is not live yet.'} Add your Solana address to be eligible:`,
            (addr) => this._savePayout(addr)
        );
    }

    async _saveName(raw) {
        const name = cleanName(raw);
        this.prefs.name = name;
        this.prefs.nameAsked = true;
        savePrefs(this.prefs);
        const res = await api.setPlayerName(playerId(), name);
        if (this.state !== 'over') return;
        this.ui.overNote(
            res.ok
                ? name
                    ? `You're on the board as ${name}.`
                    : 'Staying anon on the board.'
                : 'Could not save the name. It goes with your next run.',
            res.ok ? 'good' : 'bad'
        );
    }

    async _submit(run) {
        if (this.submitted) return;
        this.submitted = true;
        this.ui.setRank('Submitting to the board…');
        const mine = () => run.runId === this._runId && this.state === 'over';
        const token = await turnstileToken(
            this.daily?.turnstileSiteKey,
            document.getElementById('turnstile'),
            {
                onInteractive: (on) => {
                    if (mine()) this.ui.botCheckHint(on);
                }
            }
        );
        const s = run.summary;
        const res = await api.submitRun({
            v: 1,
            playerId: playerId(),
            name: this.prefs.name || null,
            mode: run.mode,
            challengeDate: run.date,
            build: this.build.n,
            seed: run.seed,
            stage: s.stage,
            claimed: { score: s.score, timeMs: s.timeMs, kills: s.kills, level: s.level },
            durationMs: run.durationMs,
            log: toBase64Url(run.bytes),
            turnstileToken: token || undefined
        });
        if (res.ok && res.data?.ok) {
            run.id = res.data.id;
            // Fetch the share card now, so a tap on SHARE can attach it without waiting.
            fetchCard(location.origin, run.id).then((file) => (run.card = file));
        }
        if (run.runId !== this._runId) return;
        if (res.ok && res.data?.ok) {
            const rank = res.data.rank;
            this.ui.setRank(
                rank
                    ? `#${rank} on today’s board · verification pending${token ? '' : ' · no bot check, not prize-eligible'}`
                    : 'Submitted · verification pending'
            );
            if (!document.getElementById('screenShare').hidden) this.shareLast({ refresh: true });
        } else if (res.status === 0) {
            this.ui.setRank('Offline: could not reach the board.');
        } else {
            this.ui.setRank(`Not ranked: ${res.data?.error?.message || `error ${res.status}`}`);
        }
    }

    async _savePayout(address) {
        if (address && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
            this.ui.payoutNote(
                address.length > 44 || /\s/.test(address)
                    ? 'That is not a public address. Never paste a private key or seed phrase anywhere.'
                    : 'That is not a Solana address.',
                'bad'
            );
            return;
        }
        const res = await api.setPayoutAddress(playerId(), address);
        if (res.ok) {
            this.prefs.payoutAddress = address;
            savePrefs(this.prefs);
            if (address) {
                this.ui.payoutSaved(address, () => this._askPayout());
                this.ui.overNote('Prize address saved.', 'good');
            } else {
                this.ui.payoutNote('Removed. You can add one after any daily run.');
            }
        } else {
            this.ui.payoutNote(res.data?.error?.message || 'Could not save. Try again.', 'bad');
        }
    }

    /** SHARE: the phone's share sheet where there is one, otherwise the share screen. */
    shareLast({ refresh = false } = {}) {
        const run = this.lastRun;
        if (!run) return;
        const { text, url } = shareText({
            summary: run.summary,
            mode: run.mode,
            date: run.date,
            build: this.build.n,
            origin: location.origin,
            runId: run.id
        });
        const native = canNativeShare();
        if (!refresh && native && matchMedia('(pointer: coarse)').matches) {
            // Straight from the tap, or Safari refuses. The card is attached when it's already fetched.
            nativeShare({ text, url, file: run.card }).then((out) => {
                if (out === 'failed') this.shareLast({ refresh: true });
            });
            return;
        }
        const note = (t, tone) => this.ui.shareNote(t, tone);
        this.ui.showShare(
            {
                text,
                url,
                xUrl: xIntentUrl({ text, url }),
                cardUrl: run.id ? `${location.origin}/og/run/${run.id}.png` : null,
                native
            },
            {
                x: () => note('Opening X in a new tab…'),
                copy: async () =>
                    (await copyText(`${text}\n${url}`))
                        ? note('Copied. Paste it anywhere.', 'good')
                        : note('Copy failed. Select the text above and copy it.', 'bad'),
                native: async () => {
                    const out = await nativeShare({ text, url, file: run.card });
                    if (out === 'failed')
                        note('This browser could not open its share sheet.', 'bad');
                }
            }
        );
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
