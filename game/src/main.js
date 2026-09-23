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
    document.title = `BULL RUN · Patch #${build.n}`;
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
        else if (game.state === 'title' && key === 'enter') startDaily();
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

    const openBoard = async (from) => {
        back = from;
        ui.showBoard({ title: "TODAY'S BOARD", sub: 'Loading…', entries: [] });
        const r = await api.getLeaderboard(game.daily?.date);
        const rows = r.data?.rows || r.data?.entries || [];
        ui.showBoard({
            title: "TODAY'S BOARD",
            sub: r.ok
                ? `Daily ${r.data.date} · Patch #${r.data.build ?? build.n} · ${fmtNum(r.data.total || rows.length)} players`
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

    ui.show('screenTitle');
    animateTitleBull($('titleBull'));

    // Today's challenge (or the one in the URL). The game is fully playable without it.
    const d = await api.getDaily(challenge || undefined);
    if (d.ok && d.data?.seed) {
        game.daily = d.data;
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
        document.querySelector('#btnDaily span').textContent = 'PLAY NOW';
        ui.setDailySub('The daily board is offline, so this is a free run');
    }
}

function animateTitleBull(canvas) {
    const ctx = canvas.getContext('2d');
    const frames = bakeSprite('bull', 8);
    if (!frames || !frames.length) return;
    let t = 0;
    const draw = () => {
        if (canvas.offsetParent === null) return requestAnimationFrame(draw);
        t++;
        const img = frames[Math.floor(t / 10) % frames.length];
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const bob = Math.round(Math.sin(t / 12) * 3);
        ctx.drawImage(
            img,
            Math.round((canvas.width - img.width) / 2),
            Math.round((canvas.height - img.height) / 2) + bob
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
    window.__bullrun = {
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
