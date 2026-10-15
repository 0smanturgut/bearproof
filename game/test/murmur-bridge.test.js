import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    FrameRing,
    MAX_FRAMES,
    PARENT_ORIGINS,
    bridgeWanted,
    createMurmurBridge,
    installMurmurBridge,
    publicState
} from '../src/murmur-bridge.js';
import { Simulation, SIM_VERSION } from '../src/sim/sim.js';
import { RunRecorder, decodeRunLog, fromBase64Url } from '../src/sim/runlog.js';
import { createBot } from '../src/sim/bot.js';
import { dailyTwistForSeed } from '../src/sim/content.js';

const ALLOWED = 'https://crowlab.ai';

/** A window stand-in: a parent that collects posts, a URL, timers that only count. */
function fakeWindow({ framed = true, search = '?murmur=1', referrer = `${ALLOWED}/murmur/` } = {}) {
    const parent = { posts: [], postMessage: (msg, origin) => parent.posts.push({ msg, origin }) };
    const listeners = [];
    const win = {
        location: { search },
        document: { referrer, createElement: () => fakeCanvas() },
        addEventListener: (type, fn) => listeners.push({ type, fn }),
        removeEventListener: () => {},
        setInterval: () => 1,
        clearInterval: () => {},
        listeners
    };
    win.self = win;
    win.top = framed ? {} : win;
    win.parent = framed ? parent : win;
    return { win, parent };
}

function fakeCanvas({ webp = true } = {}) {
    let n = 0;
    return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => {} }),
        toDataURL: (type) =>
            type === 'image/webp' && !webp
                ? 'data:image/png;base64,AAAA'
                : `data:${type};base64,F${n++}`
    };
}

/** A player's run, played by the autopilot for `ticks` ticks, recorded the way game.js records it. */
function playedGame(ticks, { mode = 'free', seed = 7, state = 'playing' } = {}) {
    const twist = mode === 'daily' ? dailyTwistForSeed(seed) : null;
    const sim = new Simulation({ seed, twist });
    const rec = new RunRecorder(seed, twist, sim.characterId);
    const bot = createBot();
    while (sim.tick < ticks && !sim.over) {
        if (sim.choices) {
            const i = bot.pick(sim);
            rec.pick(sim.tick, i);
            sim.choose(i);
            continue;
        }
        const code = bot.move(sim);
        rec.tick(code);
        sim.step(code);
        sim.events.length = 0;
    }
    return {
        state,
        attract: false,
        mode,
        sim,
        rec,
        renderer: { canvas: { width: 1280, height: 720 } }
    };
}

const capture = (id = 'r1', v = 1) => ({ type: 'murmur:capture', v, id });

test('murmur bridge: inert outside a frame, or without ?murmur=1', () => {
    for (const opts of [
        { framed: false },
        { framed: true, search: '' },
        { framed: true, search: '?murmur=0' },
        { framed: false, search: '?murmur=1' }
    ]) {
        const { win, parent } = fakeWindow(opts);
        assert.equal(bridgeWanted(win), false, JSON.stringify(opts));
        assert.equal(installMurmurBridge(playedGame(60), { n: 30 }, win), null);
        assert.equal(win.listeners.length, 0, 'no message listener');
        assert.equal(parent.posts.length, 0, 'nothing posted');
    }
    const { win } = fakeWindow();
    assert.equal(bridgeWanted(win), true);
});

test('murmur bridge: says ready once, then the state when it changes', () => {
    const { win, parent } = fakeWindow();
    const game = playedGame(60, { state: 'title' });
    game.attract = true; // the autopilot behind the title screen
    const bridge = installMurmurBridge(game, { n: 30 }, win);
    assert.ok(bridge);
    assert.equal(win.listeners.filter((l) => l.type === 'message').length, 1);
    assert.deepEqual(
        parent.posts.map((p) => p.msg),
        [
            { type: 'murmur:ready', v: 1, build: 30 },
            { type: 'murmur:state', v: 1, state: 'title' }
        ]
    );
    assert.ok(
        parent.posts.every((p) => p.origin === ALLOWED),
        'never posted to "*"'
    );
    bridge.poll();
    assert.equal(parent.posts.length, 2, 'no repeat while nothing changed');
    game.attract = false;
    for (const [s, want] of [
        ['playing', 'playing'],
        ['levelup', 'playing'],
        ['paused', 'paused'],
        ['over', 'over']
    ]) {
        game.state = s;
        assert.equal(publicState(game), want);
    }
    game.state = 'playing';
    bridge.poll();
    assert.deepEqual(parent.posts.at(-1).msg, { type: 'murmur:state', v: 1, state: 'playing' });
});

test('murmur bridge: answers only the parent, only from an allowed origin', () => {
    const { win, parent } = fakeWindow({ referrer: '' });
    const bridge = createMurmurBridge({ win, game: playedGame(120), build: { n: 30 } });
    bridge.handle({ origin: 'https://evil.example', source: parent, data: capture() });
    bridge.handle({ origin: 'https://crowlab.ai.evil.example', source: parent, data: capture() });
    bridge.handle({ origin: 'null', source: parent, data: capture() });
    bridge.handle({ origin: ALLOWED, source: { other: true }, data: capture() });
    bridge.handle({ origin: ALLOWED, source: parent, data: 'murmur:capture' });
    bridge.handle({ origin: ALLOWED, source: parent, data: { type: 'something-else' } });
    assert.equal(parent.posts.length, 0);
    for (const origin of PARENT_ORIGINS) {
        bridge.handle({ origin, source: parent, data: capture(origin) });
        const last = parent.posts.at(-1);
        assert.equal(last.origin, origin, 'answered to the asking origin only');
        assert.equal(last.msg.id, origin);
        assert.equal(last.msg.ok, true);
    }
    assert.equal(parent.posts.length, PARENT_ORIGINS.length);
});

test('murmur bridge: the capture result has the agreed shape', () => {
    const { win, parent } = fakeWindow();
    const game = playedGame(300, { mode: 'daily', seed: 424242 });
    const bridge = createMurmurBridge({ win, game, build: { n: 31 } });
    bridge.handle({ origin: ALLOWED, source: parent, data: capture('abc') });
    const { msg } = parent.posts.at(-1);
    assert.deepEqual(Object.keys(msg).sort(), [
        'build',
        'character',
        'frameTicks',
        'frames',
        'id',
        'mode',
        'ok',
        'runlog',
        'seed',
        'simVersion',
        'tick',
        'twist',
        'type',
        'v'
    ]);
    assert.equal(msg.type, 'murmur:capture:result');
    assert.equal(msg.v, 1);
    assert.equal(msg.id, 'abc');
    assert.equal(msg.ok, true);
    assert.equal(msg.build, 31);
    assert.equal(msg.tick, game.sim.tick);
    assert.equal(msg.seed, 424242);
    assert.equal(msg.twist, dailyTwistForSeed(424242));
    assert.equal(msg.character, 'bull');
    assert.equal(msg.simVersion, SIM_VERSION);
    assert.equal(msg.mode, 'daily');
    assert.match(msg.runlog, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual(msg.frames, []);
    assert.deepEqual(msg.frameTicks, []);
});

test('murmur bridge: no run, a bad id or another version is refused with a reason', () => {
    const { win, parent } = fakeWindow();
    const game = playedGame(60);
    const bridge = createMurmurBridge({ win, game, build: { n: 31 } });
    const ask = (data) => {
        bridge.handle({ origin: ALLOWED, source: parent, data });
        return parent.posts.at(-1).msg;
    };
    game.attract = true;
    game.state = 'attract';
    assert.deepEqual(ask(capture('t')), {
        type: 'murmur:capture:result',
        v: 1,
        id: 't',
        ok: false,
        reason: 'no_run'
    });
    game.attract = false;
    game.state = 'title';
    assert.equal(ask(capture('t')).reason, 'no_run');
    game.state = 'playing';
    assert.equal(ask(capture({ x: 1 })).reason, 'bad_request');
    assert.equal(ask(capture('x'.repeat(200))).reason, 'bad_request');
    assert.equal(ask(capture('t', 2)).reason, 'unsupported_version');
    assert.equal(ask(capture(7)).ok, true, 'a numeric id is fine');
    game.state = 'over';
    assert.equal(ask(capture('after-death')).ok, true, 'the run that just ended can be reported');
});

test('murmur bridge: one thumbnail a second while playing, at most 30, webp else jpeg', () => {
    const { win, parent } = fakeWindow();
    const game = playedGame(60);
    let made = 0;
    const bridge = createMurmurBridge({
        win,
        game,
        build: { n: 31 },
        makeCanvas: () => {
            made++;
            return fakeCanvas();
        }
    });
    game.state = 'paused';
    bridge.sampleFrame();
    game.state = 'levelup';
    bridge.sampleFrame();
    assert.equal(bridge.frames.size, 0, 'only while the run is being played');
    game.state = 'playing';
    for (let i = 0; i < 45; i++) {
        game.sim.tick += 60;
        bridge.sampleFrame();
    }
    assert.equal(bridge.frames.size, MAX_FRAMES);
    assert.equal(made, 1, 'one offscreen canvas, reused');
    bridge.handle({ origin: ALLOWED, source: parent, data: capture('f') });
    const { msg } = parent.posts.at(-1);
    assert.equal(msg.frames.length, 30);
    assert.equal(msg.frameTicks.length, 30);
    assert.ok(msg.frames.every((f) => f.startsWith('data:image/webp')));
    assert.equal(
        msg.frameTicks[29] - msg.frameTicks[0],
        29 * 60,
        'the last 30 seconds, oldest first'
    );

    // A browser that can't encode webp (Safari) sends jpeg.
    const safari = createMurmurBridge({
        win,
        game,
        build: { n: 31 },
        makeCanvas: () => fakeCanvas({ webp: false })
    });
    safari.sampleFrame();
    assert.match(safari.frames.list()[0].url, /^data:image\/jpeg/);

    // A new run starts a new recording.
    game.rec = new RunRecorder(1);
    bridge.sampleFrame();
    assert.equal(bridge.frames.size, 1);

    const ring = new FrameRing(3);
    for (let i = 0; i < 10; i++) ring.push(i);
    assert.deepEqual(ring.list(), [7, 8, 9]);
});

test('murmur bridge: the partial run log decodes and holds every tick so far', () => {
    const { win, parent } = fakeWindow();
    const game = playedGame(60 * 45, { seed: 99 });
    assert.ok(!game.sim.over, 'still running');
    const bridge = createMurmurBridge({ win, game, build: { n: 31 } });
    bridge.handle({ origin: ALLOWED, source: parent, data: capture('log') });
    const { msg } = parent.posts.at(-1);
    const log = decodeRunLog(fromBase64Url(msg.runlog));
    assert.equal(log.ticks, game.sim.tick);
    assert.equal(log.ticks, 60 * 45);
    assert.equal(
        log.runs.reduce((n, [, c]) => n + c, 0),
        log.ticks
    );
    assert.equal(log.seed, 99);
    assert.equal(log.twist, 'none');
    assert.equal(log.character, 'bull');
    assert.equal(log.simVersion, SIM_VERSION);
    assert.deepEqual(log.picks, game.rec.picks);

    // Replaying the partial log lands on the same tick and state as the live run.
    const sim = new Simulation({ seed: log.seed, twist: log.twist, character: log.character });
    let pi = 0;
    for (const [code, count] of log.runs) {
        for (let k = 0; k < count; k++) {
            while (sim.choices) sim.choose(log.picks[pi++][1]);
            sim.step(code);
            sim.events.length = 0;
        }
    }
    assert.equal(sim.tick, game.sim.tick);
    assert.equal(sim.stateHash(), game.sim.stateHash());
});

test('murmur bridge: main.js still installs it', () => {
    const main = fs.readFileSync(
        fileURLToPath(new globalThis.URL('../src/main.js', import.meta.url)),
        'utf8'
    );
    assert.match(main, /import \{ installMurmurBridge \} from '\.\/murmur-bridge\.js';/);
    assert.match(main, /\n\s+installMurmurBridge\(game, build\);/);
});
