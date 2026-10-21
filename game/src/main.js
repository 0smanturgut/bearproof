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
import * as api from './api.js';
import { createBot } from './sim/bot.js';
import { bountyText, readBounty } from './bounty.js';
import { guideSections } from './guide.js';
import { badgeSection } from './achievements.js';
import { MARKET_BY_ID, buy, characterUnlocked, equip, normalizeProfile } from './profile.js';
import { missionTab, nextMission } from './missions.js';
import { moveFocus, setupMapPicker, setupShowcase } from './title.js';
import {
    CHARACTER_IDS,
    STAGE_ROTATION,
    TWISTS,
    characterDef,
    dailyTwistForSeed,
    getStage,
    stageForSeed
} from './sim/content.js';
import { RULES_22_FROM } from './sim/sim.js';

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

    const startDaily = () => game.startRun(game.daily ? 'daily' : 'free');
    const startFree = (stage) => game.startRun('free', { stage });
    // The back button of each sub-screen, for Esc and the pad's B.
    const BACK = {
        screenBoard: 'btnBoardBack',
        screenSettings: 'btnSettingsBack',
        screenGuide: 'btnGuideBack',
        screenMarket: 'btnMarketBack',
        screenMissions: 'btnMissionsBack',
        screenMaps: 'btnMapsBack'
    };
    // The main menu, top to bottom, for the arrow keys and the pad.
    const MENU = ['btnDaily', 'btnFree', 'btnMissions', 'btnMarket', 'btnBoard', 'btnGuide'];
    const onMenu = () => game.state === 'title' || game.backdrop;
    const focusedButton = () =>
        document.activeElement?.closest?.('.screen:not([hidden])') &&
        /^(BUTTON|A)$/.test(document.activeElement.tagName);

    /** One menu input from the keyboard or a pad: up / down / left / right / ok / back. */
    const menuInput = (what) => {
        audio.unlock();
        const screen = ui.current;
        if (what === 'back') {
            if (BACK[screen]) $(BACK[screen]).click();
            return;
        }
        if (screen === 'screenTitle') {
            if (what === 'up' || what === 'down') {
                if (moveFocus(MENU, what === 'up' ? -1 : 1)) audio.menuMove();
            } else if (what === 'left' || what === 'right') {
                showcase.step(what === 'left' ? -1 : 1);
            } else if (what === 'ok') {
                if (focusedButton()) document.activeElement.click();
                else startDaily();
            }
        } else if (screen === 'screenMaps') {
            if (what === 'ok') {
                if (focusedButton() && !document.activeElement.classList.contains('map-card'))
                    document.activeElement.click();
                else maps.go();
            } else maps.move(what === 'left' || what === 'up' ? -1 : 1);
        } else if (what === 'ok' && focusedButton()) {
            document.activeElement.click();
        }
    };
    const KEYS = {
        arrowup: 'up',
        arrowdown: 'down',
        arrowleft: 'left',
        arrowright: 'right',
        w: 'up',
        s: 'down',
        a: 'left',
        d: 'right',
        escape: 'back',
        backspace: 'back'
    };
    input.onPause = () => game.togglePause();
    input.onMute = () => setSound(prefs.muted);
    input.onKey = (key, e) => {
        if (game.state === 'levelup') return ui.levelKey(key);
        if (!onMenu()) return;
        if (key === 'enter' || key === ' ') {
            // Enter on a focused button clicks it natively (space is held back by the input layer, so it's
            // clicked here); Enter anywhere else on the title plays today's challenge.
            if (focusedButton()) {
                if (key === ' ') document.activeElement.click();
                return;
            }
            e?.preventDefault();
            return menuInput('ok');
        }
        if (KEYS[key]) menuInput(KEYS[key]);
    };
    // The pad on the menus: d-pad to move, A to pick, B to go back, Start to play.
    game.onMenuButton = (b) => {
        const what = { 0: 'ok', 1: 'back', 12: 'up', 13: 'down', 14: 'left', 15: 'right' }[b];
        if (what) menuInput(what);
    };

    $('btnDaily').addEventListener('click', startDaily);
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
    $('btnGuide').addEventListener('click', () => {
        back = 'screenTitle';
        // the Collection: what this player has met is open, the rest is locked
        const seen = normalizeProfile(prefs.profile).seen;
        ui.showGuide([...guideSections(seen), badgeSection(prefs.achievements)]);
    });
    $('btnGuideBack').addEventListener('click', () => ui.show(back));

    // The Market: spend CLOUT on cosmetics. Everything is drawing only; the Simulation never sees it.
    let marketTab = 'chars';
    const openMarket = () => {
        prefs.profile = normalizeProfile(prefs.profile);
        ui.showMarket(
            prefs.profile,
            marketTab,
            {
                tab: (id) => {
                    marketTab = id;
                    audio.click();
                    openMarket();
                },
                play: (id) => {
                    if (!characterUnlocked(prefs.profile, id)) return;
                    prefs.character = id;
                    persist();
                    audio.click();
                    ui.toast(`PLAYING AS ${characterDef(id).name.toUpperCase()}`, 'bull', 1400);
                    lookChanged();
                },
                buy: (id) => {
                    const r = buy(prefs.profile, id);
                    if (!r.ok) {
                        audio.deny();
                        haptics.hurt();
                        ui.toast(
                            r.error === 'short'
                                ? `NEED ${fmtNum(MARKET_BY_ID[id].price - prefs.profile.clout)} MORE CLOUT`
                                : 'ALREADY YOURS',
                            'bear',
                            1400
                        );
                        return;
                    }
                    prefs.profile = r.profile;
                    const unlocks = MARKET_BY_ID[id].character;
                    if (unlocks) prefs.character = unlocks; // a new character is picked right away
                    persist();
                    audio.buy();
                    haptics.levelUp();
                    ui.toast(
                        unlocks
                            ? `UNLOCKED: ${MARKET_BY_ID[id].name.toUpperCase()}`
                            : `BOUGHT: ${MARKET_BY_ID[id].name.toUpperCase()}`,
                        'gold',
                        1500
                    );
                    lookChanged();
                },
                equip: (id) => {
                    const r = equip(prefs.profile, id);
                    if (!r.ok) return;
                    prefs.profile = r.profile;
                    persist();
                    audio.click();
                    lookChanged();
                }
            },
            { character: prefs.character }
        );
    };
    const lookChanged = () => {
        game.applyLook();
        ui.profileStrip(prefs.profile);
        showcase.refresh();
        openMarket();
    };
    const marketFromMenu = () => {
        audio.unlock();
        openMarket();
    };
    $('btnProfile').addEventListener('click', marketFromMenu);
    $('btnMarket').addEventListener('click', marketFromMenu);
    $('btnMarketBack').addEventListener('click', () => {
        ui.show('screenTitle');
        ui.profileStrip(normalizeProfile(prefs.profile));
        showcase.refresh();
    });

    // Missions: goals that pay CLOUT once. A screen of tabs; it opens on the tab of the character on show.
    let shownChar = prefs.character || 'bull';
    let missionsTab = null;
    const openMissions = (tab) => {
        audio.unlock();
        missionsTab = tab;
        ui.showMissions(normalizeProfile(prefs.profile), tab, (id) => {
            audio.click();
            openMissions(id);
        });
    };
    $('btnMissions').addEventListener('click', () => openMissions(missionsTab || shownChar));
    $('charMission').addEventListener('click', () => {
        const m = nextMission(normalizeProfile(prefs.profile).missions, shownChar);
        openMissions(m ? missionTab(m) : shownChar);
    });
    $('btnMissionsBack').addEventListener('click', () => {
        ui.show('screenTitle');
        $('btnMissions').focus({ preventScroll: true });
    });

    // The character on show, and the Free Run map picker (its pick previews live behind it).
    let dailyStage = null; // today's Daily map, marked in the picker
    const showcase = setupShowcase({
        prefs,
        persist,
        audio,
        onUnlock: () => {
            // a locked character opens the Market on the Characters tab
            audio.unlock();
            marketTab = 'chars';
            openMarket();
        },
        onRender: (id) => {
            shownChar = id;
            ui.missionStrip(normalizeProfile(prefs.profile), id);
        }
    });
    // Back on the title after a run: the missions it moved show at once
    game.onTitle = () => showcase.refresh();
    const maps = setupMapPicker({
        prefs,
        persist,
        audio,
        onPreview: (stage) => {
            if (game.backdrop && game.sim?.stageId !== stage)
                game.startBackdrop({ keepScreen: true, stage });
        },
        onStart: (stage) => startFree(stage)
    });
    $('btnFree').addEventListener('click', () => {
        audio.unlock();
        ui.show('screenMaps', { focus: false });
        maps.open(dailyStage);
    });
    $('btnMapsBack').addEventListener('click', () => ui.show('screenTitle'));

    game.startBackdrop(); // the title screen floats over the live build, played by the autopilot
    ui.setMenuMeta('miFree', `${STAGE_ROTATION.length} maps · no board`);

    // Today's challenge (or the one in the URL). The game is fully playable without it.
    const tape = [{ label: 'BUILD', value: `#${build.n} LIVE` }];
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
        // a Daily under the legacy rules had three maps (game.js plays it under them)
        const legacy = d.data.date < RULES_22_FROM;
        const tw = TWISTS[dailyTwistForSeed(d.data.seed, legacy)];
        dailyStage = stageForSeed(d.data.seed, legacy);
        const map = getStage(dailyStage).name;
        ui.setDailyMeta(map, tw.name);
        ui.setDailyTwist(tw.description);
        tape.push(
            { label: 'DAILY', value: d.data.date },
            { label: 'MAP', value: map.toUpperCase() },
            { label: 'TWIST', value: tw.name.toUpperCase(), gold: true }
        );
        // The bounty belongs to this build, so it's shown only when today's board runs on it.
        game.bounty = readBounty(rawBounty);
        if (game.bounty) {
            ui.setDailyBounty(game.bounty.name, bountyText(game.bounty));
            tape.push({ label: 'AI BOUNTY', value: game.bounty.name.toUpperCase(), gold: true });
        }
        const pad = (n) => String(n).padStart(2, '0');
        const tick = () => {
            const left = Date.parse(d.data.endsAt) - Date.now();
            if (left <= 0) {
                ui.setDailyClock('');
                return ui.setDailySub('This challenge has ended. Reload for the new build.');
            }
            const h = Math.floor(left / 3600000);
            const m = Math.floor((left % 3600000) / 60000);
            const s = Math.floor((left % 60000) / 1000);
            ui.setDailyClock(`NEXT BUILD ${pad(h)}:${pad(m)}:${pad(s)}`);
        };
        ui.setDailySub('Same run for everyone · one board');
        tick();
        setInterval(tick, 1000);
        const lb = await api.getLeaderboard(d.data.date);
        const rows = lb.data?.rows || lb.data?.entries || [];
        const top = rows[0];
        if (top) {
            ui.setTodayTop(`Today's #1: ${top.name} · ${fmtNum(top.score)}`);
            tape.push({
                label: "TODAY'S #1",
                value: `${top.name} ${fmtNum(top.score)}`,
                gold: true
            });
        }
        const total = lb.data?.total || rows.length;
        if (total > 0) ui.setMenuMeta('miBoard', `${fmtNum(total)} on today's board`);
        if (total > 0)
            tape.push({
                label: 'ON THE BOARD',
                value: `${fmtNum(total)} PLAYER${total === 1 ? '' : 'S'}`
            });
    } else {
        document.querySelector('#btnDaily span').textContent = 'PLAY NOW ▸';
        ui.setDailySub('The daily board is offline, so this is a free run');
    }
    tape.push(
        { label: 'CHARACTERS', value: String(CHARACTER_IDS.length) },
        { label: 'MAPS', value: String(STAGE_ROTATION.length) },
        { label: 'NEW BUILD', value: 'EVERY NIGHT 00:00 UTC' },
        { label: 'BUILT BY', value: 'AN AI, IN PUBLIC' }
    );
    ui.setTape(tape);
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
            const watch = (events) => {
                game.watchBadges(events);
                game.watchMissions(events);
                game.watchCollection(events);
            };
            for (let i = 0; i < seconds * 60 && !game.sim.over; i++) {
                if (game.sim.choices) {
                    if (stopAtLevelUp) return 'levelup';
                    game.rec.pick(game.sim.tick, 0);
                    game.sim.choose(0);
                    watch(game.sim.drainEvents());
                    continue;
                }
                const code = bot ? bot.move(game.sim) : 0;
                game.rec.tick(code);
                game.sim.step(code);
                watch(game.sim.drainEvents()); // badges and missions, without the effects
            }
            return game.sim.over ? 'over' : 'running';
        }
    };
}

boot();
