// The loot update's client side: every sound game.js asks for exists and plays, the chest buzz is its own pattern,
// and the level-up's REROLL / SKIP go through the same recorded pick path as a card.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AudioEngine } from '../src/audio.js';
import { HapticEngine, VIBRATION_PATTERNS } from '../src/haptics.js';
import { CHOICE_REROLL, CHOICE_SKIP } from '../src/sim/content.js';

const gameSrc = readFileSync(fileURLToPath(import.meta.resolve('../src/game.js')), 'utf8');

/** A Web Audio stand-in that counts every oscillator and noise burst started. */
function fakeAudio() {
    let started = 0;
    const param = () => ({
        value: 0,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {}
    });
    const node = (extra) => ({ connect: (n) => n, start: () => started++, stop() {}, ...extra });
    class FakeContext {
        constructor() {
            this.currentTime = 0;
            this.sampleRate = 8000;
            this.state = 'running';
            this.destination = node();
        }
        createGain() {
            return node({ gain: param() });
        }
        createOscillator() {
            return node({ type: 'sine', frequency: param() });
        }
        createBufferSource() {
            return node();
        }
        createBuffer(ch, len) {
            return { getChannelData: () => new Float32Array(len) };
        }
    }
    return { count: () => started, FakeContext };
}

test('every sound game.js plays exists on the audio engine', () => {
    const names = new Set([...gameSrc.matchAll(/_sfx\(\s*'([a-zA-Z]+)'/g)].map((m) => m[1]));
    for (const n of ['smash', 'ramen', 'cloutGet', 'liquiditySweep', 'halt', 'squeeze'])
        assert.ok(names.has(n), `game.js plays ${n}`);
    for (const n of ['chestDrop', 'chest', 'reroll', 'skip']) assert.ok(names.has(n), n);
    for (const n of names)
        assert.equal(typeof AudioEngine.prototype[n], 'function', `audio.${n}() exists`);
});

test('the loot sounds play notes, and a chest pops once per item', (t) => {
    mock.timers.enable({ apis: ['setTimeout'] });
    t.after(() => mock.timers.reset());
    const { count, FakeContext } = fakeAudio();
    globalThis.window = { AudioContext: FakeContext };
    t.after(() => delete globalThis.window);
    const audio = new AudioEngine({});
    audio.unlock();
    const play = (fn) => {
        const before = count();
        fn();
        mock.timers.tick(2000);
        return count() - before;
    };
    for (const n of [
        'smash',
        'ramen',
        'cloutGet',
        'liquiditySweep',
        'halt',
        'squeeze',
        'chestDrop',
        'reroll',
        'skip'
    ])
        assert.ok(play(() => audio[n]()) > 0, `${n} makes a sound`);
    const one = play(() => audio.chest(1));
    const three = play(() => audio.chest(3));
    assert.equal(three - one, 4, 'two more items: two more pops of two notes each');
});

test('the chest has its own vibration', () => {
    const calls = [];
    const h = new HapticEngine({ vibration: true }, { vibrate: (p) => calls.push(p) });
    assert.equal(h.chest(), true);
    assert.deepEqual(calls[0], [...VIBRATION_PATTERNS.chest]);
});

test('REROLL and SKIP are recorded like a card: through _choose, never straight to the sim', () => {
    // the only place game.js hands a pick to the simulation records it first
    const chooses = [...gameSrc.matchAll(/this\.sim\.choose\(/g)];
    assert.equal(chooses.length, 1, 'one call site');
    assert.match(gameSrc, /this\.rec\.pick\(this\.sim\.tick, i\);\s*this\.sim\.choose\(i\);/);
    assert.equal(CHOICE_REROLL, 7);
    assert.equal(CHOICE_SKIP, 8);
});
