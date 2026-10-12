// Music v2: the boss track. Patterns are pure data (music.js); the engine is driven with a fake AudioContext.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { MUSIC, bossStep, calmStep, musicMood, stepMs } from '../src/music.js';
import { AudioEngine } from '../src/audio.js';
import { Simulation } from '../src/sim/sim.js';

const boss = (hp, maxHp = 100) => ({ boss: true, hp, maxHp });
const bear = { boss: false, hp: 5, maxHp: 10 };

test('mood: calm without a live boss, heat from the most hurt boss', () => {
    assert.deepEqual(musicMood([]), { boss: false, heat: 0 });
    assert.deepEqual(musicMood([bear]), { boss: false, heat: 0 });
    assert.deepEqual(
        musicMood([bear, boss(0)]),
        { boss: false, heat: 0 },
        'a dead boss is no boss'
    );
    assert.deepEqual(musicMood([boss(100)]), { boss: true, heat: 0 });
    assert.deepEqual(musicMood([boss(80), bear, boss(25)]), { boss: true, heat: 0.75 });
    assert.deepEqual(musicMood([boss(150)]), { boss: true, heat: 0 }, 'overhealed clamps to 0');
});

test('tempo: calm at 180 ms, a boss from 150 ms down to 105 ms as it dies', () => {
    assert.equal(stepMs(null), 180);
    assert.equal(stepMs({ boss: false, heat: 0 }), MUSIC.CALM_MS);
    assert.equal(stepMs({ boss: true, heat: 0 }), 150);
    assert.equal(stepMs({ boss: true, heat: 1 }), 105);
    let last = Infinity;
    for (let h = 0; h <= 1; h += 0.1) {
        const ms = stepMs({ boss: true, heat: h });
        assert.ok(ms <= last && ms < MUSIC.CALM_MS, `heat ${h}`);
        last = ms;
    }
});

test('the calm track plays the same notes as before Music v2', () => {
    // The old sequencer: arp [0,3,7,12,7,3] over roots [0,-4,-9,-2], a bass pedal an octave down on steps 0 and 4.
    const arp = [0, 3, 7, 12, 7, 3];
    const roots = [0, -4, -9, -2];
    for (let i = 0; i < 48; i++) {
        const root = roots[Math.floor(i / 6) % 4];
        const notes = calmStep(i);
        const lead = 220 * Math.pow(2, (root + arp[i % 6]) / 12);
        assert.ok(Math.abs(notes[0].freq - lead) < 1e-9, `step ${i}`);
        assert.equal(notes[0].type, 'triangle');
        assert.equal(notes.length, i % 6 === 0 || i % 6 === 4 ? 2 : 1, `step ${i}`);
        if (notes[1]) assert.ok(Math.abs(notes[1].freq - 110 * Math.pow(2, root / 12)) < 1e-9);
    }
});

test('the boss track: kick on every beat, off-beat hats, a lead past half HP, hats doubled near the end', () => {
    const count = (heat, pred) => {
        let n = 0;
        for (let i = 0; i < MUSIC.BOSS_STEPS; i++) n += bossStep(i, heat).filter(pred).length;
        return n;
    };
    const kick = (n) => n.sweep === 45;
    const hat = (n) => n.noise;
    const lead = (n) => n.type === 'square';
    for (let i = 0; i < MUSIC.BOSS_STEPS; i++)
        assert.equal(bossStep(i, 0).some(kick), i % 4 === 0, `kick on step ${i}`);
    assert.equal(count(0, kick), 4);
    assert.equal(count(0, hat), 4);
    assert.equal(count(0.74, hat), 4);
    assert.equal(count(0.75, hat), 12);
    assert.equal(count(0.49, lead), 0);
    assert.ok(count(0.5, lead) >= 8, 'the lead line comes in at half HP');
    assert.ok(count(0.5, () => true) > count(0, () => true), 'more going on past half HP');
    // Every pitched note is audible and every note fades out.
    for (const heat of [0, 0.6, 1])
        for (let i = 0; i < MUSIC.BOSS_STEPS * 4; i++)
            for (const n of bossStep(i, heat)) {
                if (!n.noise) assert.ok(n.freq >= 40 && n.freq < 4000, `${n.freq} Hz`);
                assert.ok(n.vol > 0 && n.vol <= 0.2 && n.dur > n.attack);
            }
});

/** A Web Audio stand-in that records every oscillator and noise burst the music starts. */
function fakeAudio() {
    const played = [];
    const param = () => ({
        value: 0,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {}
    });
    const node = (extra) => ({ connect: (n) => n, start() {}, stop() {}, ...extra });
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
            const o = node({ type: 'sine', frequency: param() });
            o.frequency.setValueAtTime = (f) => played.push({ type: o.type, freq: f });
            return o;
        }
        createBufferSource() {
            return node({ start: () => played.push({ noise: true }) });
        }
        createBuffer(ch, len) {
            return { getChannelData: () => new Float32Array(len) };
        }
    }
    return { played, FakeContext };
}

test('the engine switches to the boss track on a downbeat, speeds up, and comes back to calm', (t) => {
    mock.timers.enable({ apis: ['setTimeout'] });
    t.after(() => mock.timers.reset());
    const { played, FakeContext } = fakeAudio();
    globalThis.window = { AudioContext: FakeContext };
    t.after(() => delete globalThis.window);
    const audio = new AudioEngine({ musicVolume: 0.4 });
    audio.init();
    audio.startMusic();

    mock.timers.tick(179);
    assert.equal(played.length, 0, 'nothing before the first calm step');
    mock.timers.tick(1);
    assert.deepEqual(
        played.map((n) => n.type),
        ['triangle', 'sine'],
        'calm step 0: arp and bass'
    );

    played.length = 0;
    audio.setMood(musicMood([boss(100)]));
    assert.equal(audio.musicStepIndex, 0, 'the boss track starts on its downbeat');
    mock.timers.tick(180); // the step already scheduled at the calm tempo
    assert.ok(
        played.some((n) => n.freq === 150),
        'boss step 0 has the kick'
    );
    mock.timers.tick(149);
    assert.equal(audio.musicStepIndex, 1);
    mock.timers.tick(1);
    assert.equal(audio.musicStepIndex, 2, 'the next boss step lands 150 ms later');
    played.length = 0;
    mock.timers.tick(150);
    assert.ok(played.length > 0, 'step 2: hat and bass');

    // Nearly dead: 105 ms a step, with the square lead in.
    audio.setMood(musicMood([boss(1)]));
    played.length = 0;
    // Finish the step in flight, then most of a bar at the fast tempo (mocked timers fire one hop per tick).
    for (let ms = 0; ms < 150 + 105 * 15; ms += 5) mock.timers.tick(5);
    assert.ok(played.some((n) => n.type === 'square'));
    assert.equal(audio.musicStepIndex, 3 + 1 + 15, '15 steps at 105 ms after the one in flight');

    audio.setMood(musicMood([boss(0)]));
    assert.deepEqual(audio.mood, { boss: false, heat: 0 });
    assert.equal(audio.musicStepIndex, 0, 'calm restarts on its downbeat');
    played.length = 0;
    for (let ms = 0; ms < 105 + 180 * 3; ms += 5) mock.timers.tick(5);
    assert.equal(audio.musicStepIndex, 4);
    assert.ok(played.every((n) => n.type === 'triangle' || n.type === 'sine'));

    audio.stopMusic();
    played.length = 0;
    for (let ms = 0; ms < 2000; ms += 5) mock.timers.tick(5);
    assert.equal(played.length, 0, 'stopped means silent');
});

test('music off schedules nothing, and a new run starts calm', (t) => {
    mock.timers.enable({ apis: ['setTimeout'] });
    t.after(() => mock.timers.reset());
    const { played, FakeContext } = fakeAudio();
    globalThis.window = { AudioContext: FakeContext };
    t.after(() => delete globalThis.window);
    const audio = new AudioEngine({ musicEnabled: false });
    audio.init();
    audio.startMusic();
    mock.timers.tick(5000);
    assert.equal(played.length, 0);
    assert.equal(audio.musicInterval, null);

    audio.setMood({ boss: true, heat: 0.9 });
    audio.setMood(null);
    assert.deepEqual(audio.mood, { boss: false, heat: 0 });
});

test('a real run: the first boss turns the music, its HP heats it, its death cools it', () => {
    const sim = new Simulation({ seed: 9 });
    sim.player.hp = sim.player.maxHp = sim.player.baseMaxHp = 1e9;
    sim._exitScam = () => {};
    const spawn = sim._spawn.bind(sim);
    sim._spawn = (dt) => {
        sim.spawnAcc = 0;
        spawn(dt);
    };
    assert.equal(musicMood(sim.enemies).boss, false);
    let b = null;
    while (!b && sim.time < 600) {
        if (sim.choices) sim.choose(0);
        else sim.step(0);
        b = sim.enemies.find((e) => e.boss && e.hp > 0);
    }
    assert.ok(b, 'a boss arrived');
    assert.equal(musicMood(sim.enemies).boss, true);
    b.hp = b.maxHp * 0.4;
    assert.ok(Math.abs(musicMood(sim.enemies).heat - 0.6) < 1e-9);
    b.hp = 0;
    assert.equal(musicMood(sim.enemies).boss, false);
});
