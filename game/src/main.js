/**
 * @module main
 * @description Boot: wire DOM, input, audio and the game shell, load today's challenge, show the title.
 *
 * URL parameters:
 *   ?challenge=YYYY-MM-DD   play that day's challenge (ranked only if it is today's and on this build)
 *   ?attract=1              autopilot preview for the HQ page: no UI, no sound, loops forever
 */

import { Game } from './game.js';
import { UI } from './ui.js';
import { fmtNum } from './format.js';
import { InputManager } from './input.js';
import { AudioEngine } from './audio.js';
import { HapticEngine } from './haptics.js';
import { loadKeymap } from './keymap.js';
import { loadPrefs, savePrefs } from './prefs.js';
import { bakeSprite } from './art/sprites.js';
import * as api from './api.js';
import { createBot } from './sim/bot.js';
import { bountyText, readBounty } from './bounty.js';
import {
    CHARACTERS,
    CHARACTER_IDS,
    TWISTS,
    characterDef,
    dailyTwistForSeed
} from './sim/content.js';

const params = new URLSearchParams(location.search);
const attract = params.has('attract');
const challenge = /^\d{4}-\d{2}-\d{2}$/.test(params.get('challenge') || '')
    ? params.get('challenge')
    : null;
const $ = (id) => document.getElementById(id);

async function boot() {
    const prefs = loadPrefs();
    if (attract) {
        prefs.muted = true;
        document.body.classList.add('attract');
    }
    const ui = new UI();
    const input = new InputManager();
    input.setKeymap(loadKeymap());
    const joy = $('joy');
    input.attach($('touch'), { base: joy, knob: joy.querySelector('.joy-knob') });
    const audio = new AudioEngine(prefs);
    const haptics = new HapticEngine(prefs);
    const build = await api.buildInfo();
    ui.setBuildLabel(`#${build.n}`);
    document.title = `BEARPROOF · Build #${build.n}`;
    try {
        await Promise.race([
            document.fonts?.load('20px "Jersey 10"'),
            new Promise((r) => setTimeout(r, 1200))
        ]);
    } catch {
        /* the canvas falls back to monospace */
    }

    const game = new Game({ canvas: $('game'), ui, input, audio, haptics, prefs, build, attract });
    if (['localhost', '127.0.0.1'].includes(location.hostname)) installDebugHooks(game);

    if (attract) {
        $('attractBadge').hidden = false;
        ui.hideAll();
        game.startRun('free');
        return;
    }

    let back = 'screenTitle';
    const persist = () => savePrefs(prefs);
    const setSound = (on) => {
        prefs.muted = !on;
        audio.setMuted(!on);
        ui.setSoundLabel(on);
        persist();
    };
    ui.setSoundLabel(!prefs.muted);

    input.onPause = () => game.togglePause();
    input.onMute = () => setSound(prefs.muted);
    input.onKey = (key) => {
        if (game.state === 'levelup') ui.levelKey(key);
        else if ((game.state === 'title' || game.backdrop) && key === 'enter') startDaily();
    };

    const startDaily = () => game.startRun(game.daily ? 'daily' : 'free');
    $('btnDaily').addEventListener('click', startDaily);
    $('btnFree').addEventListener('click', () => game.startRun('free'));
    $('btnSound').addEventListener('click', () => setSound(prefs.muted));
    $('btnPause').addEventListener('click', () => game.togglePause());
    $('btnResume').addEventListener('click', () => game.resume());
    $('btnRestart').addEventListener('click', () => game.startRun(game.mode));
    $('btnQuit').addEventListener('click', () => game.quitToTitle());
    $('btnAgain').addEventListener('click', () => game.startRun(game.mode));
    $('btnShare').addEventListener('click', () => game.shareLast());
    $('btnShareBack').addEventListener('click', () => ui.show('screenOver'));

    const openBoard = async (from) => {
        back = from;
        ui.showBoard({ title: "TODAY'S BOARD", sub: 'Loading…', entries: [] });
        const r = await api.getLeaderboard(game.daily?.date);
        const rows = r.data?.rows || r.data?.entries || [];
        ui.showBoard({
            title: "TODAY'S BOARD",
            sub: r.ok
                ? `Daily ${r.data.date} · Build #${r.data.build ?? build.n} · ${fmtNum(r.data.total || rows.length)} player${(r.data.total || rows.length) === 1 ? '' : 's'}`
                : 'The board is offline right now.',
            entries: rows,
            me: game.lastRun?.id
        });
    };
    $('btnBoard').addEventListener('click', () => openBoard('screenTitle'));
    $('btnOverBoard').addEventListener('click', () => openBoard('screenOver'));
    $('btnBoardBack').addEventListener('click', () => ui.show(back));
    $('btnSettings').addEventListener('click', () => {
        back = 'screenTitle';
        ui.showSettings(prefs, (k, on) => {
            if (k === 'sound') setSound(on);
            else if (k === 'musicEnabled') audio.toggleMusic(on);
            else prefs[k] = on;
            persist();
        });
    });
    $('btnSettingsBack').addEventListener('click', () => ui.show(back));

    game.startBackdrop(); // the title screen floats over the live build, played by the autopilot
    setupCharacterPick(prefs, persist);
    animateTitleBull($('titleBull'), () => characterDef(prefs.character).sprite || 'bull');

    // Today's challenge (or the one in the URL). The game is fully playable without it.
    const [d, rawBounty] = await Promise.all([
        api.getDaily(challenge || undefined),
        api.getBounty()
    ]);
    const onThisBuild = d.ok && String(d.data?.build) === String(build.n);
    if (d.ok && d.data?.seed && !onThisBuild) {
        // Today's board is pinned to the build that was live at 00:00 UTC. Say so instead of pretending.
        document.querySelector('#btnDaily span').textContent = 'PLAY NOW ▸';
        ui.setDailySub(
            `Today's board runs on Build #${d.data.build}. This build's first board opens at 00:00 UTC.`
        );
    } else if (d.ok && d.data?.seed) {
        game.daily = d.data;
        const tw = TWISTS[dailyTwistForSeed(d.data.seed)];
        ui.setDailyTwist(`Today's twist: ${tw.name}. ${tw.description}`);
        // The bounty belongs to this build, so it's shown only when today's board runs on it.
        game.bounty = readBounty(rawBounty);
        if (game.bounty) ui.setDailyBounty(game.bounty.name, bountyText(game.bounty));
        const tick = () => {
            const left = Date.parse(d.data.endsAt) - Date.now();
            if (left <= 0)
                return ui.setDailySub('This challenge has ended. Reload for the new build.');
            const h = Math.floor(left / 3600000);
            const m = Math.floor((left % 3600000) / 60000);
            const s = Math.floor((left % 60000) / 1000);
            const pad = (n) => String(n).padStart(2, '0');
            ui.setDailySub(`Same market for everyone · new build in ${pad(h)}:${pad(m)}:${pad(s)}`);
        };
        tick();
        setInterval(tick, 1000);
        const lb = await api.getLeaderboard(d.data.date);
        const top = (lb.data?.rows || lb.data?.entries || [])[0];
        if (top) ui.setTodayTop(`Today's #1: ${top.name} · ${fmtNum(top.score)}`);
    } else {
        document.querySelector('#btnDaily span').textContent = 'PLAY NOW ▸';
        ui.setDailySub('The daily board is offline, so this is a free run');
    }
}

/**
 * The character select on the title screen: one button per CHARACTERS entry, one tap, saved in prefs. The
 * Simulation reads the character's rules; this only shows them.
 */
function setupCharacterPick(prefs, persist) {
    const root = $('charPick');
    if (!CHARACTERS[prefs.character]) prefs.character = 'bull';
    const buttons = CHARACTER_IDS.map((id) => {
        const c = CHARACTERS[id];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'char-btn';
        b.setAttribute('role', 'radio');
        b.dataset.char = id;
        const cv = document.createElement('canvas');
        cv.className = 'char-face';
        cv.setAttribute('aria-hidden', 'true');
        const frames = bakeSprite(c.sprite || 'bull', 2);
        if (frames?.[0]) {
            cv.width = frames[0].width;
            cv.height = frames[0].height;
            cv.getContext('2d').drawImage(frames[0], 0, 0);
        }
        const text = document.createElement('span');
        text.className = 'char-text';
        const name = document.createElement('b');
        name.textContent = c.name.replace(/^The /, '').toUpperCase();
        const sub = document.createElement('small');
        sub.textContent = c.description;
        text.append(name, sub);
        b.append(cv, text);
        b.addEventListener('click', () => {
            prefs.character = id;
            persist();
            sync();
        });
        root.append(b);
        return b;
    });
    const sync = () => {
        for (const b of buttons)
            b.setAttribute('aria-checked', String(b.dataset.char === prefs.character));
        $('tagline').textContent = characterDef(prefs.character).tagline;
    };
    sync();
}

function animateTitleBull(canvas, spriteId) {
    const ctx = canvas.getContext('2d');
    if (!bakeSprite('bull', 5)) return;
    const t0 = performance.now();
    const draw = (now) => {
        if (canvas.offsetParent === null) return requestAnimationFrame(draw);
        const t = Math.max(0, now - t0) / 1000;
        const frames = bakeSprite(spriteId(), 5) || bakeSprite('bull', 5);
        const img = frames[Math.floor(t * 10) % frames.length];
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // contact shadow
        const g = ctx.createRadialGradient(
            canvas.width / 2,
            canvas.height - 16,
            2,
            canvas.width / 2,
            canvas.height - 16,
            90
        );
        g.addColorStop(0, 'rgba(0,0,0,0.55)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, canvas.height - 34, canvas.width, 34);
        const bob = Math.round(Math.sin(t * 7) * 2);
        ctx.drawImage(
            img,
            Math.round((canvas.width - img.width) / 2),
            canvas.height - img.height - 10 + bob
        );
        requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
}

/**
 * Localhost-only hooks used by the smoke test (game/scripts/smoke.mjs). Never active in production.
 * They only feed recorded input, so a run driven by them still replays exactly.
 */
function installDebugHooks(game) {
    window.__bearproof = {
        game,
        state: () => game.state,
        summary: () => game.sim.summary(),
        /**
         * Fast-forward with recorded input: idle, or an autopilot style ('survive' | 'reckless').
         * Stops early at a pending level-up when `stopAtLevelUp`, so the real card UI opens.
         */
        advance(seconds, { style = null, stopAtLevelUp = false } = {}) {
            const bot = style ? createBot({ style }) : null;
            for (let i = 0; i < seconds * 60 && !game.sim.over; i++) {
                if (game.sim.choices) {
                    if (stopAtLevelUp) return 'levelup';
                    game.rec.pick(game.sim.tick, 0);
                    game.sim.choose(0);
                    continue;
                }
                const code = bot ? bot.move(game.sim) : 0;
                game.rec.tick(code);
                game.sim.step(code);
                game.sim.drainEvents();
            }
            return game.sim.over ? 'over' : 'running';
        }
    };
}

boot();
