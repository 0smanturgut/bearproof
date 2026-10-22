/**
 * @module game
 * @description The client shell around the simulation: fixed-step loop, input → move code → sim,
 * sim events → effects/audio/haptics/UI, level-up cards, run recording and score submission.
 * Also runs "attract mode" (an autopilot playing the live build), used by the HQ preview.
 */

import { LEGACY_SIM_VERSION, RULES_22_FROM, SIM_VERSION, Simulation } from './sim/sim.js';
import { BOSSES, CHOICE_REROLL, CRATE_LOOT, ENEMIES, SIM } from './sim/content.js';
import { encodeMove } from './sim/input-codes.js';
import { RunRecorder, toBase64Url } from './sim/runlog.js';
import {
    CHARACTER_IDS,
    PASSIVES,
    STAGE_ROTATION,
    TWISTS,
    WEAPONS,
    dailyTwistForSeed,
    getStage,
    stageForSeed
} from './sim/content.js';
import { createBot } from './sim/bot.js';
import { Fx } from './fx.js';
import { KILL_COLORS, Renderer } from './render.js';

const WEAPONS_BY_ID = Object.fromEntries(Object.values(WEAPONS).map((w) => [w.id, w]));

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
import { bountyProgress, bountyText, clearsBounty } from './bounty.js';
import { createTracker } from './achievements.js';
import { completeMissions, createMissionTracker, mergeBest } from './missions.js';
import { createCollector, mergeSeen } from './collection.js';
import { musicMood } from './music.js';
import { applyRun, equippedItem, normalizeProfile, skinSprite } from './profile.js';
import { buildSheet, createDamageReport } from './report.js';

// Market Eras: the colour each new era flashes in
const ERA_FLASH = {
    defi: '255,180,70',
    altseason: '255,70,220',
    bear: '255,59,92'
};

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
        this.renderer = new Renderer(canvas, prefs);
        this.fx = new Fx(prefs);
        this.state = 'title';
        this.sim = new Simulation({ seed: 1 });
        this.cam = { x: 0, y: 0 };
        this.acc = 0;
        this.last = 0;
        this.clock = 0;
        this.daily = null;
        this.bounty = null; // this build's bounty (bounty.js readBounty); only Daily Challenge runs count
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
            // A phone may have dropped the GPU canvases while the page was hidden: paint every sprite again.
            if (!document.hidden) this.renderer.recover();
        });
        // Chrome restores a lost 2D context blank; the baked sprites have to be painted again.
        canvas.addEventListener('contextrestored', () => this.renderer.recover());
        requestAnimationFrame((t) => this._frame(t));
    }

    // --- Run lifecycle ----------------------------------------------------------

    /** Title screen: the autopilot plays a free run behind the menu (no sound, no submit). */
    /**
     * The live build behind the menus, played by the autopilot. `stage` puts it on a map (the Free Run picker
     * previews a map this way); `keepScreen` restarts it under whatever menu screen is open.
     */
    startBackdrop({ keepScreen = false, stage = this._backdropStage } = {}) {
        const keep = keepScreen && !!this.ui.current;
        this._backdropStage = stage || null;
        this.startRun('free', { backdrop: true, stage, keepScreen: keep });
        if (keep) return; // the open menu stays exactly as it is (its scroll, its focus)
        this.ui.show('screenTitle');
        this.ui.profileStrip(normalizeProfile(this.prefs.profile));
        this.onTitle?.(); // main.js: the character card and its next mission
    }

    startRun(mode, { backdrop = false, stage = null, keepScreen = false } = {}) {
        this._keepMissionProgress(); // a restart or a quit still keeps the run's best progress
        this.backdrop = backdrop;
        this.attract = this.baseAttract || backdrop;
        this.mode = mode === 'daily' && this.daily ? 'daily' : 'free';
        // A free run's map comes from its seed like every run's, so picking a map picks a seed for it.
        const seed = this.mode === 'daily' ? this.daily.seed : seedForStage(stage);
        const legacy = this.mode === 'daily' && this.daily.date < RULES_22_FROM;
        // The Daily Challenge has one twist, the same for everyone; free runs have none.
        const twist = this.mode === 'daily' ? dailyTwistForSeed(seed, legacy) : null;
        // The chosen character is part of the run log, so the server re-simulates it too. The HQ/stream autopilot
        // takes turns through the characters, newest first, so the preview shows what's new; the title backdrop
        // plays the player's pick.
        const character = this.baseAttract
            ? CHARACTER_IDS[CHARACTER_IDS.length - 1 - (this._attractRuns++ % CHARACTER_IDS.length)]
            : this.prefs.character || null;
        // A Daily keeps the rules its day started with (sim.js RULES_22_FROM): one board, one rule set.
        const rules = legacy ? LEGACY_SIM_VERSION : SIM_VERSION;
        this.sim = new Simulation({ seed, twist, character, rules });
        this.rec = new RunRecorder(seed, twist, this.sim.characterId, this.sim.rules);
        this.applyLook();
        this.bot = this.attract ? createBot({ phase: Math.floor(Math.random() * 1000) }) : null;
        this.fx.clear();
        this.cam.x = 0;
        this.cam.y = 0;
        this.acc = 0;
        this.startedAt = performance.now();
        this.submitted = false;
        this._bossIntro = null;
        this._evolveIntros = [];
        this._eraIntro = null; // Market Eras: a new era's card waits for a level-up to close, like a boss's
        this._chestCall = null; // a boss chest dropped: its toast waits for the boss's REKT toast
        this._bountyDone = false;
        this._bountyToastAt = 0;
        // Badges: only a player's own runs count (never the autopilot)
        this.badges = this.attract ? null : createTracker(this.prefs.achievements);
        this._badgeQueue = [];
        this._badgesNew = [];
        this._badgeToastAt = 0;
        // Missions: the same, scoped to this run's character and map; they share the badges' toast queue
        this.missions = this.attract
            ? null
            : createMissionTracker(
                  normalizeProfile(this.prefs.profile).missions,
                  this.sim.characterId,
                  this.sim.stageId
              );
        this._missionsNew = [];
        // The Collection: what this player has met, saved the moment something new shows up
        this.collector = this.attract
            ? null
            : createCollector(normalizeProfile(this.prefs.profile).seen);
        this._collectN = 0;
        // The damage report on the receipt: a player's own runs only (never the autopilot's)
        this.report = this.attract ? null : createDamageReport();
        this.report?.observe(this.sim);
        this._runId++;
        this.ui.resetHud();
        if (!keepScreen) this.ui.hideAll();
        this.input.reset();
        this.state = this.attract ? 'attract' : 'playing';
        if (!this.attract) {
            this.audio.unlock();
            this.audio.setMood(null);
            this.audio.startMusic();
            this.ui.moveHint(true);
            clearTimeout(this._hintTimer);
            this._hintTimer = setTimeout(() => this.ui.moveHint(false), 4000);
            // The map's title card; a Daily's twist is on it too (it used to be a toast).
            const map = getStage(this.sim.stageId);
            this.ui.mapIntro({
                name: map.name,
                description: map.description,
                twist: twist ? TWISTS[twist] : null,
                calm: !!this.prefs.reducedMotion
            });
            api.startSession(playerId(), this.build.n, this.mode);
        } else this.ui.mapIntro(null);
    }

    /**
     * The player's Market cosmetics (skins, trail) on the renderer. Drawing only: the Simulation never sees
     * them. The HQ preview autopilot plays the plain characters.
     */
    applyLook() {
        if (this.baseAttract) {
            this.renderer.look = null;
            return;
        }
        const profile = normalizeProfile(this.prefs.profile);
        const skins = {};
        for (const id of CHARACTER_IDS) skins[id] = skinSprite(profile, id);
        this.renderer.look = { skins, trail: equippedItem(profile, 'trail')?.fx || null };
    }

    /** The equipped finale: a burst where the run ended (a plain run keeps the usual shake). */
    _finale() {
        const fin = equippedItem(normalizeProfile(this.prefs.profile), 'finale')?.fx;
        if (!fin) return;
        const p = this.sim.player;
        const fx = this.fx;
        fx.ring(p.x, p.y, 10, 220, 0.7, fin.ring, 8, true);
        fin.colors.forEach((c, i) => fx.burst(p.x, p.y, c, 14, 260 + i * 60, 3, 'spark'));
        fx.burst(p.x, p.y - 10, fin.colors[0], 10, 180, 3.5, 'ember');
        fx.addFlash(fin.ring, 0.35, 1.6);
    }

    pause() {
        if (this.state !== 'playing') return;
        this.state = 'paused';
        this.audio.stopMusic();
        this.input.reset();
        const s = this.sim;
        this.ui.showPause(buildSheet(s), {
            sub: `${this.mode === 'daily' ? `Daily ${this.daily.date}` : 'Free run'} · ${getStage(s.stageId).name}${s.twistId !== 'none' ? ` · ${TWISTS[s.twistId]?.name || ''}` : ''}`,
            timeMs: s.timeMs,
            level: s.player.level,
            kills: s.stats.kills,
            score: s.stats.score
        });
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
                this._stepEvents();
                this.acc -= STEP;
                steps++;
                if (this.sim.over) break;
            }
            if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
            // The boss track while a boss lives, faster as it loses HP.
            if (this.state === 'playing')
                this.audio.setMood({
                    ...musicMood(this.sim.enemies),
                    // Market Eras' era, or The Liquidity Pool's own voice
                    era: this.sim.era?.id || (this.sim.stageId === 'pool' ? 'pool' : undefined)
                });
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
        if (this.state !== 'title') {
            this.ui.updateHud(this.sim);
            this._bountyHud();
            this._badgeToasts();
            this._chestToast();
        }
        requestAnimationFrame((t) => this._frame(t));
    }

    /** The bounty, only in a Daily Challenge run: progress in the HUD, and a moment when it clears. */
    _bountyHud() {
        const b = this.mode === 'daily' && !this.attract ? this.bounty : null;
        if (!b) return this.ui.hudBounty(null);
        const s = this.sim;
        const progress = bountyProgress(b, {
            timeMs: s.timeMs,
            level: s.player.level,
            kills: s.stats.kills,
            bossKills: s.stats.bossKills,
            won: s.won
        });
        this.ui.hudBounty(progress);
        if (progress.done && !this._bountyDone) {
            this._bountyDone = true;
            // After the boss's REKT toast and any level-up card: the kill usually brings both.
            this._bountyToastAt = this.clock + 1.3;
        }
        if (this._bountyToastAt && this.clock >= this._bountyToastAt && this.state === 'playing') {
            this._bountyToastAt = 0;
            this.ui.toast(`BOUNTY CLEARED: ${b.name.toUpperCase()}`, 'bull', 2200);
            this._sfx('levelUp', 0);
            this.haptics.levelUp();
        }
    }

    /**
     * A boss chest dropped a beat ago: "BOSS TREASURE" once the boss's REKT toast has had its moment, with a
     * second flare on the chest so the eye finds it.
     */
    _chestToast() {
        const c = this._chestCall;
        if (!c || this.clock < c.at || this.state !== 'playing') return;
        this._chestCall = null;
        this.fx.ring(c.x, c.y, 6, 90, 0.5, '255,197,61', 5, true);
        this.fx.burst(c.x, c.y - 10, '#FFE08A', 14, 220, 3, 'ember');
        this.ui.toast('BOSS TREASURE', 'gold', 1600);
        this._sfx('chestDrop', 0);
    }

    _padButton(b) {
        if (b === 9 || b === 8) this.togglePause();
        else if (this.state === 'levelup' && b <= 2) this.ui.levelKey(String(b + 1));
        // A B X are the three cards; Y or LB rerolls, RB skips (the buttons sit in that order, left to right)
        else if (this.state === 'levelup' && (b === 3 || b === 4))
            this.ui.levelKey('r', { pad: true });
        else if (this.state === 'levelup' && b === 5) this.ui.levelKey('s', { pad: true });
        else if (this.backdrop) this.onMenuButton?.(b); // the menus (main.js)
    }

    // --- Level-up -------------------------------------------------------------

    /**
     * The level-up cards. REROLL and SKIP go through `_choose` like a card (the run log records them as picks
     * CHOICE_REROLL / CHOICE_SKIP, so a replay does exactly the same); after a reroll the same screen deals the
     * new cards (`shuffle`).
     */
    _openLevelUp(shuffle = false) {
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
        this.ui.showLevelUp(
            this.sim.player.level,
            choices,
            (i) => {
                this._choose(i);
                if (this.sim.choices) this._openLevelUp(i === CHOICE_REROLL);
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
                        this._bossShown = true;
                    } else if (this._eraIntro) {
                        const er = this._eraIntro;
                        this.ui.eraIntro(er.name, er.year, er.n);
                    }
                    // evolutions picked meanwhile: right away, or once a boss or era card has had its turn
                    const evos = this._evolveIntros || [];
                    const wait = this._bossShown || this._eraIntro ? 2500 : 0;
                    this._bossShown = false;
                    const runId = this._runId;
                    if (evos.length)
                        setTimeout(() => {
                            if (this._runId !== runId) return;
                            for (const id of evos) this.ui.evolveIntro(id);
                        }, wait);
                    this._eraIntro = null;
                    this._evolveIntros = [];
                }
            },
            {
                rerolls: this.sim.rerolls || 0,
                skips: this.sim.skips || 0,
                shuffle,
                calm: !!this.prefs.reducedMotion
            }
        );
    }

    _choose(i) {
        this.rec.pick(this.sim.tick, i);
        this.sim.choose(i);
        this._stepEvents();
    }

    /** The sim's new events: effects first, then the badge watcher. */
    _stepEvents() {
        const events = this.sim.drainEvents();
        this._events(events);
        this.report?.observe(this.sim, events);
        this.watchBadges(events);
        this.watchMissions(events);
        this.watchCollection(events);
    }

    /** A few times a second (and on every evolution), add what's new on the field to the Collection and save it. */
    watchCollection(events) {
        if (!this.collector) return;
        if (++this._collectN % 15 && !events.some((e) => e.t === 'evolve')) return;
        if (!this.collector.observe(this.sim).length) return;
        const profile = normalizeProfile(this.prefs.profile);
        profile.seen = mergeSeen(profile.seen, this.collector.seen());
        this.prefs.profile = profile;
        savePrefs(this.prefs);
    }

    /** Feed a step's events to the badge watcher; a new badge is saved at once and queued for a toast. */
    watchBadges(events) {
        if (!this.badges) return;
        for (const a of this.badges.observe(this.sim, events)) {
            const day = new Date().toISOString().slice(0, 10);
            this.prefs.achievements = { ...this.prefs.achievements, [a.id]: day };
            savePrefs(this.prefs);
            this._badgesNew.push(a);
            this._badgeQueue.push(a);
        }
    }

    /** Save the run's best mission progress (idempotent: it keeps the max, and applyRun already did at the end). */
    _keepMissionProgress() {
        if (!this.missions) return;
        const profile = normalizeProfile(this.prefs.profile);
        profile.missions = mergeBest(profile.missions, this.missions.best);
        this.prefs.profile = profile;
        savePrefs(this.prefs);
        this.missions = null;
    }

    /** Feed a step to the mission watcher; a finished mission is saved at once (paid on the receipt) and toasted. */
    watchMissions(events) {
        if (!this.missions) return;
        const fresh = this.missions.observe(this.sim, events);
        if (!fresh.length) return;
        const day = new Date().toISOString().slice(0, 10);
        const profile = normalizeProfile(this.prefs.profile);
        profile.missions = completeMissions(
            profile.missions,
            fresh.map((m) => m.id),
            day
        );
        this.prefs.profile = profile;
        savePrefs(this.prefs);
        for (const m of fresh) {
            this._missionsNew.push(m);
            this._badgeQueue.push({ mission: m });
        }
    }

    /** One badge toast at a time, a beat apart, only while the run is on screen. */
    _badgeToasts() {
        if (!this._badgeQueue?.length || this.state !== 'playing') return;
        if (this.clock < this._badgeToastAt) return;
        const a = this._badgeQueue.shift();
        if (a.mission) {
            this.ui.toast(
                `MISSION: ${a.mission.name.toUpperCase()} +${fmtNum(a.mission.reward)} CLOUT`,
                'bull',
                2000
            );
            this._sfx('mission', 0);
        } else {
            this.ui.toast(`BADGE: ${a.name.toUpperCase()}`, 'gold', 1800);
            this._sfx('achievement', 0);
        }
        this.haptics.levelUp();
        this._badgeToastAt = this.clock + 2.2;
    }

    // --- Events → juice -------------------------------------------------------

    _sfx(name, gap = 0.05, ...args) {
        if (this.attract) return;
        const t = this.clock;
        if ((this._sfxAt[name] || -1) > t - gap) return;
        this._sfxAt[name] = t;
        this.audio[name]?.(...args);
    }

    _events(events) {
        const fx = this.fx;
        const p = this.sim.player;
        // A chest's evolution is named on its reveal banner, so it skips the EVOLVED toast
        const chestOpened = events.some((e) => e.t === 'chest');
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
                case 'evolve': {
                    const name = [...Object.values(WEAPONS), ...Object.values(PASSIVES)].find(
                        (w) => w.id === e.id
                    )?.evolveName;
                    const weapon = WEAPONS_BY_ID[e.id];
                    if (this.attract || chestOpened) {
                        // the chest banner already names it
                    } else if (weapon) {
                        // a weapon gets the full card; it waits for any level-up still to pick
                        if (this.sim.choices) (this._evolveIntros ||= []).push(e.id);
                        else this.ui.evolveIntro(e.id);
                    } else {
                        this.ui.toast(
                            name ? `EVOLVED: ${name.toUpperCase()}` : 'EVOLVED',
                            'gold',
                            1400
                        );
                    }
                    fx.ring(p.x, p.y, 12, 230, 0.6, '111,216,255', 8, true);
                    fx.ring(p.x, p.y, 8, 150, 0.45, '255,197,61', 5, true);
                    fx.burst(p.x, p.y, '#9FE6FF', 26, 340, 3, 'spark');
                    fx.burst(p.x, p.y - 10, '#FFE08A', 16, 220, 3, 'ember');
                    fx.addFlash('255,197,61', 0.3, 2);
                    fx.addShake(0.5);
                    this._sfx('evolve', 0);
                    if (!this.attract) this.haptics.levelUp();
                    break;
                }
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
                    if (e.jackpot) {
                        fx.number(e.x, e.y - 70, 'JACKPOT', 'jackpotLabel');
                        fx.number(e.x, e.y - 40, `+${fmtNum(e.jackpot)}`, 'jackpot');
                        fx.burst(e.x, e.y - 60, '#FFE08A', 26, 260, 3, 'ember');
                        this._sfx('jackpot', 0);
                        if (!this.attract) this.haptics.levelUp();
                    }
                    break;
                case 'candleLand':
                    fx.ping(e.x, e.y + 4, '255,197,61');
                    fx.burst(e.x, e.y + 6, '#FFC53D', 5, 110, 2.5, 'spark');
                    this._sfx('coin', 0.03);
                    break;
                case 'candleExpire':
                    // an XP candle ran out its clock: a small grey puff, no sound (Options Expiry drops many)
                    fx.burst(e.x, e.y, '#7F8A99', 5, 70, 2.5, 'smoke');
                    break;
                case 'fire':
                    if (e.w === 'horns') fx.swipe(e.x, e.y, e.r, e.evolved);
                    else if (e.w === 'circuit_breaker') {
                        fx.ring(e.x, e.y, 20, e.r, 0.36, '70,184,240', 7, true);
                        fx.burst(e.x, e.y, '#BDEEFF', 14, e.r * 2, 3, 'spark');
                    }
                    if (e.w === 'honey_trap') break; // the jar is heard when it splashes
                    if (e.w === 'buy_wall') break; // the wall has its own sound ('wall')
                    this._sfx(
                        e.w === 'tongue'
                            ? 'tongue'
                            : e.w === 'bear_spray'
                              ? 'spray'
                              : e.w === 'pickaxe'
                                ? 'pick'
                                : 'shoot',
                        0.09
                    );
                    break;
                case 'block':
                    // Block Reward: the ground cracks in an amber ring out to the quake's edge, rock chips fly
                    fx.ring(e.x, e.y, 16, e.r, 0.4, '255,170,40', 8, true);
                    fx.ring(e.x, e.y, 8, e.r * 0.6, 0.3, '255,236,170', 4);
                    fx.burst(e.x, e.y, '#8A6A4A', 22, e.r * 2.2, 3.5, 'spark');
                    fx.burst(e.x, e.y, '#FFC53D', 14, e.r * 1.6, 3, 'spark');
                    fx.number(e.x, e.y - 46, `BLOCK #${e.count}`, 'info');
                    fx.addShake(0.5);
                    this._sfx('block', 0);
                    if (!this.attract) {
                        this.haptics.levelUp?.();
                        this.ui.toast(`BLOCK #${e.count} MINED`, 'gold', 1300);
                    }
                    break;
                case 'wall':
                    // Buy Wall: the ring itself is drawn from sim.walls; here, spray at the Whale's feet
                    fx.burst(e.x, e.y + 8, e.second ? '#A6D2FF' : '#7BF5A6', 8, 160, 2.5, 'spark');
                    this._sfx('wall', 0.2);
                    break;
                case 'sweep':
                    // Sweep the Book: a ring closing in from the sweep's edge, then the candles pour in. An
                    // empty book stays quiet: the meter under the Whale already showed the minute.
                    if (!e.n) break;
                    fx.ring(e.x, e.y, e.r * 0.55, 30, 0.45, '22,224,138', 6, true);
                    fx.burst(e.x, e.y, '#7BF5A6', 18, 260, 3, 'spark');
                    fx.burst(e.x, e.y - 20, '#E8FAFF', 8, 140, 2.5);
                    fx.number(e.x, e.y - 46, `SWEPT ${e.n}`, 'info');
                    this._sfx('sweep', 0.5);
                    if (!this.attract) {
                        this.haptics.levelUp?.();
                        this.ui.toast('SWEEP THE BOOK', 'whale', 1400);
                    }
                    break;
                case 'honeySplash':
                    // Honey Trap: the jar breaks, gold drops fly out to the puddle's edge
                    fx.ring(e.x, e.y, 6, e.r, 0.25, '255,197,61', 4);
                    fx.burst(e.x, e.y, '#FFC53D', 10, e.r * 2.4, 3, 'spark');
                    fx.burst(e.x, e.y, '#FFF6D6', 4, 120, 2.5);
                    this._sfx('honey', 0.08);
                    break;
                case 'honeyEat':
                    fx.number(e.x, e.y - 10, 'NOM NOM', 'info');
                    this._sfx('nom', 0.25);
                    break;
                case 'spray':
                    fx.spray(e.x, e.y, e.a, e.half, e.r, e.evolved);
                    break;
                case 'shieldBreak':
                    // the grizzly's blue bubble pops: ice-blue shards and a ring off the shield's edge
                    fx.ring(e.x, e.y, e.r, e.r + 26, 0.3, '70,200,255', 4);
                    fx.burst(e.x, e.y, '#9BE2FF', 14, 240, 3, 'spark');
                    fx.burst(e.x, e.y, '#E8FAFF', 6, 160, 3);
                    fx.number(e.x, e.y - e.r - 18, 'SHIELD BROKEN', 'info');
                    fx.addShake(0.15);
                    this._sfx('shieldBreak', 0.06);
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
                case 'liquidation':
                    // Liquidation Risk: a crit arcs on to the next bear, liquidation red, then gold on the jump
                    fx.line(e.x1, e.y1, e.x2, e.y2, 0.2, e.k ? '255,197,61' : '255,84,64', 4, true);
                    fx.burst(e.x2, e.y2, '#FF8C5C', 5, 150, 2.5, 'spark');
                    this._sfx('liquidation', 0.07);
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
                case 'dump':
                    // Pump and Dump pops: a red ring out to where the candles land, red confetti
                    fx.ring(e.x, e.y, 6, e.r + 18, 0.3, '255,59,92', 5, true);
                    fx.burst(e.x, e.y, '#FF3B5C', 6 + e.n * 2, 240, 3.5, 'spark');
                    fx.burst(e.x, e.y, '#16E08A', 5, 140, 3);
                    if (e.self) {
                        // it dumped on you: shout it
                        fx.number(e.x, e.y - 30, 'DUMPED', 'hurt');
                        fx.addShake(0.3);
                    } else if (e.n >= 5) fx.number(e.x, e.y - 30, `x${e.n}`, 'info');
                    this._sfx('dump', 0.06);
                    break;
                case 'scamGrab':
                    fx.ping(e.x, e.y + 4, '22,224,138');
                    this._sfx('scamGrab', 0.08);
                    break;
                case 'scamRun':
                    fx.burst(e.x, e.y + 14, 'rgba(160,140,110,', 6, 120, 8, 'dust');
                    fx.number(e.x, e.y - 34, 'EXIT SCAM!', 'info');
                    this._sfx('scamRun', 0.3);
                    if (!this.attract) this.ui.toast('EXIT SCAM: CATCH IT', 'bear', 1600);
                    break;
                case 'scamBust':
                    // the bag splits open: gold confetti out to where the candles land
                    fx.ring(e.x, e.y, 6, e.r + 22, 0.35, '255,197,61', 5, true);
                    fx.burst(e.x, e.y, '#FFC53D', 18, 260, 3, 'spark');
                    fx.burst(e.x, e.y, '#16E08A', 10, 180, 3);
                    fx.burst(e.x, e.y, '#C9964F', 8, 140, 3.5);
                    fx.number(e.x, e.y - 44, 'BAG RECOVERED', 'jackpotLabel');
                    fx.number(e.x, e.y - 20, `+${fmtNum(Math.round(e.v))} XP`, 'info');
                    fx.addShake(0.2);
                    this._sfx('scamBust', 0.1);
                    if (!this.attract) this.haptics.levelUp();
                    break;
                case 'scamGone':
                    this._sfx('scamGone', 0.3);
                    if (!this.attract && e.n > 0)
                        this.ui.toast(`EXIT SCAMMED: -${fmtNum(Math.round(e.v))} XP`, 'bear', 1800);
                    break;
                case 'clone':
                    fx.burst(e.x, e.y, '#B8C0CC', 8, 160, 3);
                    fx.burst(e.x, e.y, 'rgba(180,190,205,', 5, 60, 10, 'smoke');
                    break;
                case 'summon':
                    fx.ring(e.x, e.y, 10, 110, 0.4, '255,59,92', 6, true);
                    fx.burst(e.x, e.y, '#FF3B5C', 16, 240, 3, 'spark');
                    break;
                case 'chargeWarn':
                    // the ring itself is drawn from the boss's state (render.js), so replays show it too
                    this._sfx('leapWarn', 0.3);
                    break;
                case 'charge':
                    fx.ring(e.x, e.y, e.r * 0.5, e.r * 1.4, 0.35, '255,59,92', 6, true);
                    fx.burst(e.x, e.y + 10, 'rgba(160,140,110,', 10, 180, 9, 'dust');
                    fx.addShake(e.hit ? 0.7 : 0.35);
                    if (e.hit) fx.number(e.x, e.y - e.r, 'LIQUIDATED', 'hurt');
                    this._sfx('leapLand', 0.1);
                    break;
                case 'rugPhase':
                    fx.ring(e.x, e.y, 20, 240, 0.6, '255,59,92', 8, true);
                    fx.burst(e.x, e.y, '#FFC53D', 24, 320, 3, 'spark');
                    fx.addShake(0.8);
                    fx.addFlash('255,59,92', 0.35, 1.6);
                    this._sfx('bossSpawn', 0);
                    if (!this.attract) {
                        this.ui.toast(`${e.name.toUpperCase()} IS PULLING THE RUG`, 'bear', 2200);
                        this.haptics.bossSpawn();
                    }
                    break;
                case 'enemyTyping':
                    this._sfx('typing', 0.3);
                    break;
                case 'rugWarn':
                    fx.number(e.x, e.y - 44, 'RUG PULL!', 'info');
                    this._sfx('rugWarn', 0);
                    break;
                case 'rugPull':
                    fx.burst(e.x, e.y + 20, 'rgba(160,140,110,', 8, 120, 9, 'dust');
                    fx.addShake(0.45);
                    this._sfx('rugPull', 0);
                    if (!this.attract) this.haptics.hurt();
                    break;
                case 'cold':
                    fx.number(e.x, e.y - 34, `-${e.v} COLD`, 'hurt');
                    break;
                case 'whaleWarn':
                    this._sfx('whaleCall', 0);
                    if (!this.attract) this.ui.toast('WHALE ALERT', 'whale', 2000);
                    break;
                case 'whale':
                    fx.addShake(0.2);
                    this._sfx('whaleSplash', 0);
                    break;
                case 'whaleShove':
                    fx.burst(e.x, e.y + (e.up ? 10 : -10), '#9BE2FF', 6, 150, 3, 'spark');
                    this._sfx('whaleSplash', 0.25);
                    break;
                case 'whaleGone':
                    if (!this.attract && e.drops)
                        this.ui.toast('THE WHALE LEFT CANDLES', 'bull', 1400);
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
                              : e.id === 'moon_rocket'
                                ? '255,122,26'
                                : '22,224,138';
                    const hex =
                        e.id === 'shield'
                            ? '#9BE2FF'
                            : e.id === 'printer'
                              ? '#FFE08A'
                              : e.id === 'moon_rocket'
                                ? '#FFB05C'
                                : '#7BF5A6';
                    fx.shatter(e.x, e.y, 'supply_crate');
                    fx.burst(e.x, e.y, '#C88645', 10, 200, 3.5);
                    fx.burst(p.x, p.y, hex, 22, 320, 3, 'spark');
                    fx.ring(p.x, p.y, 10, 150, 0.45, rgb, 6, true);
                    fx.addFlash(rgb, 0.25, 2.5);
                    fx.number(p.x, p.y - 40, loot.name.toUpperCase(), 'info');
                    this._sfx(e.id === 'moon_rocket' ? 'rocket' : 'crate', 0);
                    if (!this.attract) {
                        this.ui.toast(loot.toast, 'gold', 1800);
                        if (e.id !== 'god_candle') this.haptics.levelUp(); // its slam buzzes harder
                    }
                    break;
                }
                case 'ram':
                    // Moon Rocket: an orange smash where the bear was hit
                    fx.burst(e.x, e.y, '#FFB05C', e.boss ? 14 : 8, 260, 3, 'spark');
                    fx.ring(e.x, e.y, 6, e.boss ? 60 : 36, 0.22, '255,122,26', 4);
                    fx.addShake(e.boss ? 0.25 : 0.08);
                    this._sfx('ram', 0.06);
                    if (!this.attract && e.boss) this.haptics.levelUp();
                    break;
                case 'godCandle':
                    fx.godCandle(e.x, e.y, e.r);
                    if (e.wiped) fx.number(e.x, e.y - 70, `${e.wiped} BEARS REKT`, 'info');
                    this._sfx('godCandle', 0);
                    if (!this.attract) this.haptics.bossSpawn();
                    break;
                case 'candleFreeze':
                    fx.burst(e.x, e.y, '#9BE2FF', 4, 80, 2.5, 'spark');
                    this._sfx('freeze', 0.12);
                    break;
                case 'thaw':
                    // Withdrawals reopen: the ice cracks where the boss fell and a frost burst rolls out from the bull
                    fx.ring(e.x, e.y, 10, 160, 0.45, '155,226,255', 6, true);
                    fx.burst(e.x, e.y, '#E8FAFF', 22, 300, 3, 'spark');
                    fx.ring(e.px, e.py, 20, e.r, 0.6, '70,184,240', 7, true);
                    fx.burst(e.px, e.py, '#9BE2FF', 18, e.r, 3, 'spark');
                    fx.addFlash('70,184,240', 0.3, 2);
                    // under the bull: the boss's JACKPOT numbers rise above the body, often right next to him
                    fx.number(e.px, e.py + 44, 'WITHDRAWALS OPEN', 'jackpotLabel');
                    if (e.n) fx.number(e.px, e.py + 68, `${e.n} CANDLES THAWED`, 'info');
                    this._sfx('thaw', 0);
                    if (!this.attract) this.haptics.levelUp();
                    break;
                case 'dip':
                    // Buy the Dip: the window and its countdown ring are drawn from sim state (render.js)
                    fx.ring(p.x, p.y, 10, 160, 0.5, '22,224,138', 6, true);
                    fx.burst(p.x, p.y, '#7BF5A6', 18, 280, 3, 'spark');
                    fx.addFlash('22,224,138', 0.3, 2);
                    fx.number(p.x, p.y - 48, 'BUY THE DIP', 'info');
                    this._sfx('dip', 0);
                    if (!this.attract) {
                        this.ui.toast('BUY THE DIP: KILLS HEAL', 'bull', 1800);
                        this.haptics.levelUp();
                    }
                    break;
                case 'dipHeal':
                    fx.ping(e.x, e.y, '22,224,138');
                    if (e.v > 0) fx.number(p.x, p.y - 34, `+${Math.round(e.v) || 1}`, 'heal');
                    this._sfx('dipHeal', 0.05);
                    break;
                case 'crateGone':
                    fx.burst(e.x, e.y, 'rgba(255,59,92,', 6, 70, 10, 'smoke');
                    fx.number(e.x, e.y - 20, 'LOOTED BY BEARS', 'info');
                    break;
                case 'era':
                    // Market Eras: the floor turns over (world.js re-paints it) under a flash, the old bears pop
                    fx.addFlash(ERA_FLASH[e.id] || '22,224,138', 0.7, 1.2);
                    fx.ring(e.x, e.y, 20, 520, 0.8, ERA_FLASH[e.id] || '22,224,138', 10, true);
                    fx.addShake(0.9);
                    this._sfx('era', 0);
                    if (!this.attract) {
                        if (this.sim.choices) this._eraIntro = e;
                        else this.ui.eraIntro(e.name, e.year, e.n);
                        this.haptics.bossSpawn();
                    }
                    break;
                case 'blinkWarn':
                    // the ring is drawn from the Flash Loan's own state (render.js), so replays show it too
                    this._sfx('blinkWarn', 0.15);
                    break;
                case 'blink':
                    fx.burst(e.fx, e.fy, '#B98CFF', 8, 140, 3, 'spark');
                    fx.burst(e.x, e.y, '#7FF0FF', 10, 180, 3, 'spark');
                    fx.ring(e.x, e.y, 6, 44, 0.25, '160,110,255', 4);
                    this._sfx('blink', 0.08);
                    break;
                case 'poolWarn':
                    // The Liquidity Pool: the ripples and the spiral are drawn from sim.whirlpools (render.js)
                    fx.ring(e.x, e.y, 10, e.r, 0.6, e.boss ? '190,90,255' : '127,240,255', 3);
                    this._sfx('poolWarn', 0.2);
                    if (e.boss) fx.number(e.x, e.y - 70, 'DRAIN!', 'hurt');
                    if (!this.attract && e.id === 1)
                        this.ui.toast('WHIRLPOOL: STAY OUT OF THE MIDDLE', 'whale', 2200);
                    break;
                case 'poolOpen':
                    // a ring that closes in: the water starts to go round
                    fx.ring(
                        e.x,
                        e.y,
                        e.r * 1.15,
                        16,
                        0.5,
                        e.boss ? '190,90,255' : '127,240,255',
                        5,
                        true
                    );
                    fx.burst(e.x, e.y, '#9BE2FF', 14, e.r * 1.4, 3, 'spark');
                    fx.addShake(e.boss ? 0.35 : 0.12);
                    this._sfx('whirl', 0.2);
                    break;
                case 'poolClose':
                    fx.burst(e.x, e.y, 'rgba(155,226,255,', 6, 80, 8, 'smoke');
                    break;
                case 'drown':
                    fx.burst(e.x, e.y, '#7FF0FF', 8, 150, 3, 'spark');
                    fx.ring(e.x, e.y, 4, 30, 0.3, '127,240,255', 3);
                    this._sfx('drown', 0.06);
                    break;
                case 'wave':
                    if (!this.attract && this.sim.tick > 60)
                        this.ui.toast(e.label.toUpperCase(), 'gold', 1500);
                    break;
                case 'smash':
                    // a piggy bank breaks like a kill: ceramic chunks, pink shards and a spray of coins
                    fx.shatter(e.x, e.y, 'piggy_bank', { flip: Math.random() < 0.5 });
                    fx.burst(e.x, e.y, '#F8B496', 8, 190, 3.5);
                    fx.burst(e.x, e.y - 4, '#FFC53D', 12, 230, 3, 'spark');
                    fx.burst(e.x, e.y, '#FFE08A', 5, 150, 2.5, 'ember');
                    fx.ping(e.x, e.y + 4, '255,197,61');
                    fx.addKick(0.12);
                    this._sfx('smash', 0.05);
                    break;
                case 'pickupGet':
                    this._pickupFx(e);
                    break;
                case 'squeeze':
                    // Short Squeeze: a green shockwave out to everything it wiped, gold behind it
                    fx.ring(e.x, e.y, 20, e.r, 0.65, '22,224,138', 12, true);
                    fx.ring(e.x, e.y, 10, e.r * 0.55, 0.45, '255,224,138', 6);
                    fx.burst(e.x, e.y, '#7BF5A6', 36, 520, 3.5, 'spark');
                    fx.burst(e.x, e.y, '#FFE08A', 14, 300, 3, 'ember');
                    fx.addShake(0.95);
                    fx.addKick(1);
                    fx.addFlash('22,224,138', 0.5, 1.6);
                    break;
                case 'pickupGone':
                    // left too long on the floor: a grey puff, no sound (a chest says so)
                    fx.burst(
                        e.x,
                        e.y,
                        'rgba(127,138,153,',
                        e.kind === 'chest' ? 10 : 5,
                        80,
                        9,
                        'smoke'
                    );
                    if (e.kind === 'chest') fx.number(e.x, e.y - 24, 'TREASURE GONE', 'info');
                    break;
                case 'chestDrop':
                    // a beam of gold where the boss fell: the chest is there
                    fx.line(e.x, e.y - 420, e.x, e.y, 1.4, '255,197,61', 14);
                    fx.line(e.x, e.y - 420, e.x, e.y, 1.1, '255,246,214', 4);
                    fx.ring(e.x, e.y, 8, 70, 0.5, '255,197,61', 5, true);
                    fx.burst(e.x, e.y, '#FFC53D', 18, 260, 3, 'spark');
                    fx.burst(e.x, e.y - 30, '#FFE08A', 10, 140, 3, 'ember');
                    if (!this.attract) this._chestCall = { at: this.clock + 1.9, x: e.x, y: e.y };
                    break;
                case 'chest': {
                    // the chest opens: gold rays out of the bull, the reveal banner names what came out
                    const n = e.items?.length || 1;
                    fx.shatter(e.x, e.y, 'chest', { big: true });
                    fx.ring(p.x, p.y, 10, 200, 0.6, '255,197,61', 8, true);
                    fx.burst(p.x, p.y, '#FFC53D', 26, 380, 3, 'spark');
                    fx.burst(p.x, p.y - 10, '#FFE08A', 14, 220, 3.5, 'ember');
                    fx.addFlash('255,197,61', 0.35, 1.8);
                    fx.addShake(0.3);
                    this._sfx('chest', 0, n);
                    if (!this.attract) {
                        this.ui.chestReveal(e.items, { calm: !!this.prefs.reducedMotion });
                        this.haptics.chest?.();
                    }
                    break;
                }
                case 'reroll':
                    this._sfx('reroll', 0);
                    break;
                case 'skip':
                    this._sfx('skip', 0);
                    break;
            }
        }
    }

    /** A pickup taken off the floor (sim `pickupGet`): each kind its own number, ring, sound and toast. */
    _pickupFx(e) {
        const fx = this.fx;
        const p = this.sim.player;
        const loud = !this.attract;
        switch (e.kind) {
            case 'ramen':
                fx.number(p.x, p.y - 40, e.v > 0 ? `+${Math.round(e.v)} HP` : 'FULL HP', 'info');
                fx.ring(p.x, p.y, 8, 60, 0.35, '22,224,138', 4);
                fx.burst(p.x, p.y, '#7BF5A6', 10, 160, 3, 'spark');
                fx.burst(p.x, p.y - 12, 'rgba(240,235,225,', 3, 40, 7, 'smoke'); // steam
                this._sfx('ramen', 0.1);
                break;
            case 'clout':
                fx.number(p.x, p.y - 46, `+${fmtNum(e.v)} CLOUT`, 'jackpotLabel');
                fx.ping(p.x, p.y + 4, '255,197,61');
                fx.burst(p.x, p.y - 8, '#FFC53D', 14, 220, 3, 'spark');
                fx.burst(p.x, p.y - 8, '#FFF6D6', 6, 160, 2.5, 'ember');
                this._sfx('cloutGet', 0.08);
                break;
            case 'magnet':
                // Liquidity Sweep: a gold ring closing on the bull, the candles following it in
                fx.ring(p.x, p.y, 320, 24, 0.55, '255,197,61', 7);
                fx.ring(p.x, p.y, 10, 120, 0.35, '255,224,138', 4, true);
                fx.burst(p.x, p.y, '#FFE08A', 16, 260, 3, 'spark');
                fx.addFlash('255,197,61', 0.2, 2.5);
                if (e.v) fx.number(p.x, p.y - 44, `${fmtNum(e.v)} CANDLES`, 'info');
                this._sfx('liquiditySweep', 0.2);
                if (loud) {
                    this.ui.toast('LIQUIDITY SWEEP', 'gold', 1500);
                    this.haptics.levelUp();
                }
                break;
            case 'halt':
                // Trading Halt: an icy flash and a cyan ring out over the frozen bears (the HUD counts it down)
                fx.ring(p.x, p.y, 10, 420, 0.6, '70,184,240', 8, true);
                fx.ring(p.x, p.y, 10, 200, 0.4, '232,250,255', 4);
                fx.burst(p.x, p.y, '#9BE2FF', 24, 360, 3, 'spark');
                fx.burst(p.x, p.y, '#E8FAFF', 10, 200, 3);
                fx.addFlash('155,226,255', 0.45, 1.8);
                fx.addShake(0.2);
                this._sfx('halt', 0.2);
                if (loud) {
                    this.ui.toast('TRADING HALT', 'ice', 1600);
                    this.haptics.levelUp();
                }
                break;
            case 'squeeze':
                // the shockwave itself comes with the sim's `squeeze` event
                if (e.v) fx.number(p.x, p.y - 56, `${fmtNum(e.v)} SHORTS REKT`, 'jackpotLabel');
                this._sfx('squeeze', 0.2);
                if (loud) {
                    this.ui.toast('SHORT SQUEEZE', 'bull', 1700);
                    this.haptics.bossSpawn();
                }
                break;
            default:
                fx.ping(p.x, p.y + 4, '255,197,61');
                this._sfx('pickup', 0.06);
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
                    if (backdrop) this.startBackdrop({ keepScreen: true });
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
        const bounty = this._bountyResult(summary);
        this.lastRun.bountyCleared = !!bounty?.done;
        const badges = this._badgesNew;
        const report = this.report ? this.report.rows(this.sim) : null;
        // The Collection's last look at the field, so nothing met in the final moments is lost
        if (this.collector) {
            this.collector.observe(this.sim);
            const p = normalizeProfile(this.prefs.profile);
            p.seen = mergeSeen(p.seen, this.collector.seen());
            this.prefs.profile = p;
        }
        // Bank the run: lifetime stats, bests, CLOUT, the player level and the Eternal Bear (profile.js)
        const banked = applyRun(this.prefs.profile, summary, {
            bountyCleared: this.lastRun.bountyCleared,
            missionBest: this.missions?.best
        });
        this.prefs.profile = banked.profile;
        savePrefs(this.prefs);
        this._finale();
        setTimeout(
            () =>
                this.ui.showOver(
                    { summary, title, sub, buildLine, bounty, badges, banked, report },
                    {
                        calm: !!this.prefs.reducedMotion,
                        tick: () => this.audio.cloutTick?.(),
                        levelUp: () => {
                            this.audio.levelUp();
                            this.haptics.levelUp();
                        },
                        bear: () => this.audio.jackpot()
                    }
                ),
            700
        );
        setTimeout(() => this._maybeSubmit(), 750);
    }

    /** The receipt's bounty row for a finished Daily run, or null (free run, no bounty). */
    _bountyResult(summary) {
        const b = this.bounty;
        if (!b || this.mode !== 'daily') return null;
        const done = clearsBounty(b, summary);
        if (!done) return { done, value: 'MISSED', note: `${b.name}: ${bountyText(b)}.` };
        return {
            done,
            value: 'CLEARED',
            note: this._rankable()
                ? 'Bounty cleared. Paid after 00:10 UTC if the run verifies and you left a Solana address.'
                : null
        };
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
        // The server words the prize rules (they change when holders vote on them) and the not-yet-live state.
        this.ui.askPayout(
            this.prefs.payoutAddress || '',
            prize?.status === 'live'
                ? `${prize.note || 'Today’s verified #1 wins the daily prize in $ANSEM.'} Add your Solana address:`
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
            runId: run.id,
            bounty: run.bountyCleared ? this.bounty.name : null
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

/** A random seed whose map is `stage` (any map when it's not one of the rotation's). */
function seedForStage(stage) {
    let seed = randomSeed();
    if (!STAGE_ROTATION.includes(stage)) return seed;
    for (let i = 0; i < 256 && stageForSeed(seed) !== stage; i++) seed = randomSeed();
    return seed;
}

function randomSeed() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        return crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    }
    return (Math.random() * 0xffffffff) >>> 0 || 1;
}
