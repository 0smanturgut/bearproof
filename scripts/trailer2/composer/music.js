// The soundtrack, synthesised in an OfflineAudioContext from the same timeline as the picture: 120 BPM, A minor,
// the game's own progression (Am F C G) and its arpeggio. Every cue in the timeline is a sound here, and the
// game's own sound effects play where the footage made them. No samples, no files: oscillators and noise.
import { BPM, BEAT, BAR, SECTIONS, DURATION, allCues, footageSfx } from './timeline.js';

const SR = 48000;
const S16 = BEAT / 4;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

// Chord per bar (root MIDI in octave 2, and a pad voicing).
const CH = {
    Am: { root: 45, pad: [57, 60, 64], tones: [57, 60, 64, 69] },
    F: { root: 41, pad: [57, 60, 65], tones: [53, 57, 60, 65] },
    C: { root: 48, pad: [55, 60, 64], tones: [55, 60, 64, 67] },
    G: { root: 43, pad: [55, 59, 62], tones: [55, 59, 62, 67] },
    E: { root: 40, pad: [56, 59, 64], tones: [56, 59, 64, 68] },
    Bb: { root: 46, pad: [58, 62, 65], tones: [58, 62, 65, 70] }
};
const CHORDS = [
    'Am F C G', // 0-3 intro
    'Am', // 4 drop A
    'F C G', // 5-7
    'Am F C G Am F', // 8-13 evolution
    'E', // 14 riser
    'Am F C G', // 15-18 drop B
    'Am Bb E', // 19-21 bosses
    'Am F C G Am F', // 22-27 loop
    'E', // 28 riser
    'Am F Am' // 29-31 end
]
    .join(' ')
    .split(' ');

// The hook: four bars over Am F C G, [16th step, length in 16ths, MIDI].
const HOOK = [
    [
        [0, 3, 76],
        [3, 1, 74],
        [4, 2, 72],
        [6, 2, 74],
        [8, 4, 76],
        [12, 4, 81]
    ],
    [
        [0, 3, 79],
        [3, 1, 77],
        [4, 2, 76],
        [6, 2, 72],
        [8, 6, 69],
        [14, 2, 72]
    ],
    [
        [0, 3, 76],
        [3, 1, 74],
        [4, 2, 72],
        [6, 2, 74],
        [8, 4, 76],
        [12, 4, 79]
    ],
    [
        [0, 2, 83],
        [2, 2, 81],
        [4, 4, 79],
        [8, 4, 74],
        [12, 4, 76]
    ]
];

function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export async function renderMusic({ scenes, meta, duration = DURATION }) {
    const ctx = new OfflineAudioContext(2, Math.ceil(duration * SR), SR);
    const R = rng(7);

    // ---------------------------------------------------------------- buses
    // band (music + drums) → section fader and a DJ high-pass → master. The picture's cues and the game's own
    // sounds skip the fader, so a slam in the quiet intro still lands.
    const dB = (x) => 10 ** (x / 20);
    const master = ctx.createGain();
    master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 2.4;
    comp.attack.value = 0.006;
    comp.release.value = 0.22;
    const clip = ctx.createWaveShaper();
    clip.curve = (() => {
        const n = 4096;
        const c = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const x = (i / (n - 1)) * 2 - 1;
            c[i] = Math.tanh(x);
        }
        return c;
    })();
    clip.oversample = '4x';
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 24;
    master.connect(hp).connect(comp).connect(clip).connect(ctx.destination);

    const band = ctx.createGain();
    const bandHP = ctx.createBiquadFilter();
    bandHP.type = 'highpass';
    bandHP.Q.value = 0.7;
    band.connect(bandHP).connect(master);

    // the fader, bar by bar: [dB at the start, dB at the end]
    const FADER = [
        ...[
            [-11, -11],
            [-10, -10],
            [-9, -9],
            [-8, -1]
        ], // intro, riser
        [0.5, 0.5], // drop A
        ...[
            [-5, -5],
            [-5, -5],
            [-5, -5]
        ], // the Build Agent
        ...[
            [-2, -2],
            [-3.5, -3.5],
            [-3.5, -3.5],
            [-2.5, -2.5],
            [-1.5, -1.5],
            [-0.5, -0.5]
        ], // Day 0 → today
        [-2, 0], // riser
        ...[
            [1, 1],
            [1, 1],
            [1, 1],
            [1, 1]
        ], // drop B
        ...[
            [-1.5, -1.5],
            [0.5, 0.5],
            [0.5, 0.5]
        ], // bosses
        ...[
            [-5.5, -5.5],
            [-5.5, -5.5],
            [-5.5, -5.5],
            [-5.5, -5.5],
            [-5.5, -5.5],
            [-5.5, -5.5]
        ], // the loop
        [-3, 0], // riser
        ...[
            [1, 1],
            [1, 1],
            [0, 0]
        ] // end
    ];
    band.gain.setValueAtTime(dB(FADER[0][0]), 0);
    FADER.forEach(([a, z], b) => {
        const t0 = b * BAR;
        if (b > 0) band.gain.linearRampToValueAtTime(dB(a), t0 + 0.02);
        band.gain.linearRampToValueAtTime(dB(z), t0 + BAR - 0.02);
    });
    // the high-pass: thin intro, full drop, lifting off in every riser
    bandHP.frequency.setValueAtTime(260, 0);
    bandHP.frequency.setValueAtTime(260, 3 * BAR);
    bandHP.frequency.exponentialRampToValueAtTime(90, 4 * BAR - 0.05);
    bandHP.frequency.setValueAtTime(20, 4 * BAR);
    for (const b of [14, 28]) {
        bandHP.frequency.setValueAtTime(20, b * BAR);
        bandHP.frequency.exponentialRampToValueAtTime(520, (b + 1) * BAR - 0.05);
        bandHP.frequency.setValueAtTime(20, (b + 1) * BAR);
    }

    // reverb
    const verb = ctx.createConvolver();
    verb.buffer = (() => {
        const len = Math.floor(SR * 2.6);
        const b = ctx.createBuffer(2, len, SR);
        for (let ch = 0; ch < 2; ch++) {
            const d = b.getChannelData(ch);
            const r = rng(11 + ch);
            for (let i = 0; i < len; i++) {
                const t = i / SR;
                d[i] = (r() * 2 - 1) * Math.exp(-t / 0.55) * (t < 0.012 ? t / 0.012 : 1);
            }
        }
        return b;
    })();
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.3;
    const verbLP = ctx.createBiquadFilter();
    verbLP.type = 'lowpass';
    verbLP.frequency.value = 5200;
    const verbHP = ctx.createBiquadFilter();
    verbHP.type = 'highpass';
    verbHP.frequency.value = 180;
    verb.connect(verbHP).connect(verbLP).connect(verbOut).connect(band);

    // delay (dotted 8th) for the lead
    const delay = ctx.createDelay(2);
    delay.delayTime.value = BEAT * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const dLP = ctx.createBiquadFilter();
    dLP.type = 'lowpass';
    dLP.frequency.value = 3200;
    const dOut = ctx.createGain();
    dOut.gain.value = 0.28;
    delay.connect(dLP).connect(fb).connect(delay);
    dLP.connect(dOut).connect(band);

    // music (ducked by the kick) and drums, into the band
    const music = ctx.createGain();
    const duck = ctx.createGain();
    duck.connect(band);
    const introLP = ctx.createBiquadFilter();
    introLP.type = 'lowpass';
    introLP.Q.value = 0.8;
    introLP.frequency.setValueAtTime(700, 0);
    introLP.frequency.exponentialRampToValueAtTime(2200, 3 * BAR);
    introLP.frequency.exponentialRampToValueAtTime(9000, 3.9 * BAR);
    introLP.frequency.setValueAtTime(20000, 4 * BAR);
    music.connect(introLP).connect(duck);
    const drums = ctx.createGain();
    drums.connect(band);
    const sfx = ctx.createGain();
    sfx.gain.value = 0.9;
    sfx.connect(master);
    const game = ctx.createGain();
    game.gain.value = 0.55;
    const gameLP = ctx.createBiquadFilter();
    gameLP.type = 'lowpass';
    gameLP.frequency.value = 5000;
    game.connect(gameLP).connect(master);

    const send = (node, amount, target = verb) => {
        const g = ctx.createGain();
        g.gain.value = amount;
        node.connect(g).connect(target);
    };

    // bit-crush for Day 0 (the "8-bit" build)
    const crush = ctx.createWaveShaper();
    crush.curve = (() => {
        const n = 4096;
        const c = new Float32Array(n);
        const steps = 6;
        for (let i = 0; i < n; i++) {
            const x = (i / (n - 1)) * 2 - 1;
            c[i] = Math.round(x * steps) / steps;
        }
        return c;
    })();
    const chip = ctx.createGain();
    chip.gain.value = 0.9;
    chip.connect(crush).connect(duck);

    // ---------------------------------------------------------------- noise
    const noiseBuf = (() => {
        const b = ctx.createBuffer(1, SR * 2, SR);
        const d = b.getChannelData(0);
        const r = rng(3);
        for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
        return b;
    })();
    const noise = (
        t,
        dur,
        dest,
        {
            type = 'highpass',
            f = 1000,
            q = 0.7,
            gain = 1,
            attack = 0.001,
            curve = null,
            f2 = null
        } = {}
    ) => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        const flt = ctx.createBiquadFilter();
        flt.type = type;
        flt.frequency.setValueAtTime(f, t);
        if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
        flt.Q.value = q;
        const g = ctx.createGain();
        if (curve === 'swell') {
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.92);
            g.gain.linearRampToValueAtTime(0, t + dur);
        } else {
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(gain, t + attack);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        }
        src.connect(flt).connect(g).connect(dest);
        src.start(t, R() * 1.5);
        src.stop(t + dur + 0.05);
        return g;
    };
    const osc = (
        t,
        dur,
        dest,
        {
            type = 'sine',
            f = 440,
            f2 = null,
            gain = 0.3,
            attack = 0.004,
            release = null,
            detune = 0,
            sweepT = null
        } = {}
    ) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f, t);
        if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + (sweepT ?? dur));
        o.detune.value = detune;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + (release ?? 0));
        o.connect(g).connect(dest);
        o.start(t);
        o.stop(t + dur + (release ?? 0) + 0.05);
        return { o, g };
    };

    // ---------------------------------------------------------------- instruments
    const kicks = [];
    const kick = (t, v = 1, dest = drums) => {
        kicks.push(t);
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(155, t);
        o.frequency.exponentialRampToValueAtTime(52, t + 0.09);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.85 * v, t + 0.003);
        g.gain.setTargetAtTime(0.0001, t + 0.06, 0.13);
        const sat = ctx.createWaveShaper();
        sat.curve = clip.curve;
        o.connect(g).connect(sat).connect(dest);
        o.start(t);
        o.stop(t + 0.7);
        noise(t, 0.012, dest, { type: 'highpass', f: 2500, gain: 0.25 * v });
    };
    const clap = (t, v = 1) => {
        const g = ctx.createGain();
        g.gain.value = 1;
        g.connect(drums);
        send(g, 0.35);
        for (const [dt, a] of [
            [0, 0.8],
            [0.011, 0.7],
            [0.022, 1]
        ])
            noise(t + dt, dt === 0.022 ? 0.2 : 0.02, g, {
                type: 'bandpass',
                f: 1250,
                q: 0.9,
                gain: 0.55 * v * a
            });
    };
    const snare = (t, v = 1) => {
        noise(t, 0.16, drums, { type: 'bandpass', f: 1900, q: 0.7, gain: 0.45 * v });
        osc(t, 0.08, drums, { type: 'triangle', f: 210, f2: 150, gain: 0.3 * v });
    };
    const hat = (t, v = 1, open = false) =>
        noise(t, open ? 0.22 : 0.035, drums, {
            type: 'highpass',
            f: open ? 7000 : 8200,
            gain: (open ? 0.12 : 0.1) * v
        });
    const crash = (t, v = 1) => {
        const g = noise(t, 1.8, drums, { type: 'highpass', f: 4200, gain: 0.22 * v });
        send(g, 0.3);
    };
    const bass = (t, m, dur, v = 1, dest = music) => {
        const f = mtof(m);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 3;
        lp.frequency.setValueAtTime(2400 * v, t);
        lp.frequency.exponentialRampToValueAtTime(240, t + dur * 0.9);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.26 * v, t + 0.006);
        g.gain.setTargetAtTime(0.0001, t + dur * 0.8, 0.03);
        lp.connect(g).connect(dest);
        for (const d of [-8, 8]) {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = f;
            o.detune.value = d;
            o.connect(lp);
            o.start(t);
            o.stop(t + dur + 0.2);
        }
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.value = f / 2;
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0, t);
        sg.gain.linearRampToValueAtTime(0.24 * v, t + 0.006);
        sg.gain.setTargetAtTime(0.0001, t + dur * 0.85, 0.03);
        sub.connect(sg).connect(dest);
        sub.start(t);
        sub.stop(t + dur + 0.2);
    };
    const pad = (t, notes, dur, v = 1) => {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1500;
        lp.Q.value = 0.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.07 * v, t + 0.25);
        g.gain.setValueAtTime(0.07 * v, t + dur - 0.05);
        g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
        lp.connect(g).connect(music);
        send(g, 0.5);
        for (const m of notes)
            for (const d of [-11, 0, 11]) {
                const o = ctx.createOscillator();
                o.type = 'sawtooth';
                o.frequency.value = mtof(m);
                o.detune.value = d;
                o.connect(lp);
                o.start(t);
                o.stop(t + dur + 0.7);
            }
    };
    const arpNote = (t, m, v = 1, type = 'triangle', dest = music) => {
        const r = osc(t, 0.16, dest, { type, f: mtof(m), gain: 0.09 * v, attack: 0.003 });
        send(r.g, 0.18, delay);
    };
    const lead = (t, m, dur, v = 1) => {
        const f = mtof(m);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.11 * v, t + 0.008);
        g.gain.setTargetAtTime(0.08 * v, t + 0.05, 0.1);
        g.gain.setTargetAtTime(0.0001, t + dur - 0.02, 0.05);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 4200;
        g.connect(lp).connect(music);
        send(lp, 0.22);
        send(lp, 0.45, delay);
        const vib = ctx.createOscillator();
        vib.frequency.value = 5.5;
        const vg = ctx.createGain();
        vg.gain.setValueAtTime(0, t);
        vg.gain.linearRampToValueAtTime(0, t + 0.15);
        vg.gain.linearRampToValueAtTime(f * 0.006, t + 0.35);
        vib.connect(vg);
        vib.start(t);
        vib.stop(t + dur + 0.3);
        for (const [type, det, a] of [
            ['square', -6, 0.5],
            ['sawtooth', 6, 0.5],
            ['square', 1200, 0.18]
        ]) {
            const o = ctx.createOscillator();
            o.type = type;
            o.frequency.value = f;
            o.detune.value = det;
            vg.connect(o.frequency);
            const og = ctx.createGain();
            og.gain.value = a;
            o.connect(og).connect(g);
            o.start(t);
            o.stop(t + dur + 0.3);
        }
    };
    const sub = (t, m, dur, v = 1) => {
        const r = osc(t, dur, music, { type: 'sine', f: mtof(m), gain: 0.3 * v, attack: 0.05 });
        return r;
    };
    const riser = (t0, dur, v = 1) => {
        noise(t0, dur, sfx, {
            type: 'bandpass',
            f: 300,
            f2: 7000,
            q: 1.2,
            gain: 0.3 * v,
            curve: 'swell'
        });
        const r = osc(t0, dur, sfx, {
            type: 'sawtooth',
            f: 110,
            f2: 880,
            gain: 0.05 * v,
            attack: dur * 0.9
        });
        send(r.g, 0.4);
    };

    // ---------------------------------------------------------------- arrangement
    const barT = (b) => b * BAR;
    for (let b = 0; b < SECTIONS.length; b++) {
        const sec = SECTIONS[b];
        const ch = CH[CHORDS[b]];
        const t0 = barT(b);
        const beat = (k) => t0 + k * BEAT;
        const s16 = (k) => t0 + k * S16;
        const full = sec.startsWith('drop') || sec === 'evo5';
        const hookBar =
            (b -
                (sec === 'dropB'
                    ? 15
                    : sec === 'dropC'
                      ? 29
                      : sec === 'evo4' || sec === 'evo5'
                        ? 12
                        : 4)) %
            4;

        if (sec === 'intro' || sec === 'riser') {
            // muffled four-on-the-floor, the game's own arpeggio, a pad
            for (let k = 0; k < 4; k++) {
                if (sec === 'riser' && k === 3) break;
                kick(beat(k), 0.8);
            }
            // the game's own arpeggio shape (up and back down), on this bar's chord tones
            for (let k = 0; k < 16; k++) {
                const m = ch.tones[[0, 1, 2, 3, 2, 1][k % 6]] + 12;
                if (sec === 'riser' && k >= 14) break;
                arpNote(s16(k), m, 0.8 + (k % 4 === 0 ? 0.3 : 0));
            }
            pad(t0, ch.pad, BAR - (sec === 'riser' ? BEAT * 0.7 : 0), 0.9);
            if (b >= 1) for (let k = 0; k < 8; k++) hat(t0 + k * BEAT * 0.5 + BEAT * 0.25, 0.6);
            if (sec === 'riser') {
                riser(t0, BAR - BEAT * 0.55, 1);
                // snare roll: 8ths → 16ths → 32nds
                for (let k = 0; k < 4; k++) snare(beat(k * 0.5), 0.25 + k * 0.05);
                for (let k = 0; k < 8; k++) snare(beat(2 + k * 0.25), 0.35 + k * 0.05);
            }
            continue;
        }

        if (sec === 'boss0') {
            // the drums drop out, a drone, then the Rug Lord lands on beat 3
            sub(t0, BAR, 45, 1.1);
            const dr = osc(t0, BAR * 0.95, music, {
                type: 'sawtooth',
                f: mtof(33),
                gain: 0.08,
                attack: 0.3
            });
            send(dr.g, 0.3);
            kick(beat(2), 1);
            kick(beat(3.5), 0.8);
            snare(beat(3), 0.8);
            for (let k = 8; k < 16; k++)
                bass(s16(k), ch.root - 12 + (k % 4 === 3 ? 12 : 0), S16 * 0.9, 1.1);
            continue;
        }
        if (sec === 'boss1' || sec === 'boss2') {
            // half-time, heavy: kick on 1 and the "and" of 2, snare on 3
            kick(beat(0), 1);
            kick(beat(1.5), 0.9);
            if (sec === 'boss1') kick(beat(2.75), 0.7);
            snare(beat(2), 1);
            clap(beat(2), 0.8);
            for (let k = 0; k < 8; k++) hat(beat(k * 0.5), 0.7, k % 2 === 1);
            const riff = [0, 0, 12, 0, 1, 0, -2, 0];
            const stop = sec === 'boss2' ? 7 : 8;
            for (let k = 0; k < stop; k++)
                bass(t0 + k * BEAT * 0.5, ch.root - 12 + riff[k], BEAT * 0.45, 1.2);
            pad(t0, ch.pad, sec === 'boss2' ? BAR * 0.85 : BAR, 1.1);
            if (sec === 'boss2') riser(t0 + BEAT * 2, BEAT * 1.6, 0.8);
            continue;
        }
        if (sec === 'riser2' || sec === 'riser3') {
            // E major: tension before the drop, a snare roll and a gap
            for (let k = 0; k < 2; k++) kick(beat(k), 0.9);
            pad(t0, ch.pad, BAR - BEAT * 0.5, 1);
            for (let k = 0; k < 12; k++) bass(s16(k), ch.root, S16 * 0.8, 0.8);
            for (let k = 0; k < 8; k++) snare(beat(k * 0.25), 0.3 + k * 0.03);
            for (let k = 0; k < 12; k++) snare(beat(2 + k * (1.5 / 12)), 0.45 + k * 0.04);
            riser(t0, BAR - BEAT * 0.3, 1.1);
            continue;
        }
        if (sec === 'outro') {
            kick(t0, 1);
            crash(t0, 0.8);
            pad(t0, [57, 60, 64, 69], BAR * 0.9, 1.3);
            sub(t0, BAR * 0.9, 45, 1);
            lead(t0, 81, BEAT * 3, 0.8);
            for (let k = 0; k < 12; k++) arpNote(s16(k), [69, 72, 76, 81][k % 4], 0.9 - k * 0.06);
            continue;
        }

        // ---- the grooves: evo layers first
        const lvl = sec.startsWith('evo') ? Number(sec.slice(3)) : 9;
        const layer = (n) => lvl >= n;
        if (sec === 'evo0') {
            // Day 0: a lonely square-wave arpeggio through a bit-crusher
            for (let k = 0; k < 16; k++)
                arpNote(s16(k), ch.tones[[0, 1, 2, 3, 2, 1, 0, 2][k % 8]], 1.4, 'square', chip);
            for (let k = 0; k < 4; k++)
                osc(beat(k), 0.08, chip, { type: 'triangle', f: 120, f2: 45, gain: 0.5 });
            continue;
        }
        // kick
        for (let k = 0; k < 4; k++) kick(beat(k), sec === 'loop' ? 0.9 : 1);
        if (b === 4 || b === 15 || b === 29 || b === 22) crash(t0, b === 22 ? 0.6 : 1);
        // clap, hats
        if (layer(2)) {
            clap(beat(1), 0.9);
            clap(beat(3), 0.9);
            for (let k = 0; k < 16; k++) {
                const accent = k % 4 === 2 ? 1 : k % 2 === 0 ? 0.55 : 0.75;
                if (sec === 'loop' && k % 2 === 0) continue;
                hat(s16(k), accent * (full ? 1 : 0.85), full && k % 8 === 6);
            }
        }
        // bass: 8ths, octave on the offbeat of 2 and 4
        if (layer(1)) {
            const pat = [0, 0, 0, 12, 0, 0, 0, 12];
            for (let k = 0; k < 8; k++)
                bass(t0 + k * BEAT * 0.5, ch.root + pat[k], BEAT * 0.42, full ? 1.1 : 0.95);
        }
        // pad
        if (layer(2)) pad(t0, ch.pad, BAR, sec === 'grooveA' ? 0.8 : 1);
        // arp
        const arpV = sec === 'grooveA' ? 0.8 : sec === 'loop' ? 0.75 : full ? 0.9 : 0.85;
        for (let k = 0; k < 16; k++) {
            const m = ch.tones[[0, 1, 2, 3, 2, 1, 2, 3][k % 8]] + (full && k % 8 >= 4 ? 12 : 0);
            arpNote(
                s16(k),
                m,
                arpV * (k % 4 === 0 ? 1.2 : 1),
                layer(2) ? 'triangle' : 'square',
                layer(2) ? music : chip
            );
        }
        // Pepe's build: a little "ribbit" counter-line
        if (lvl === 3)
            for (const k of [3, 7, 11, 15])
                osc(s16(k), 0.09, music, { type: 'sine', f: mtof(84), f2: mtof(72), gain: 0.07 });
        // the hook
        if (sec.startsWith('drop') || (layer(4) && lvl < 9)) {
            const phrase = HOOK[(sec === 'dropA' ? 0 : hookBar + 4) % 4];
            for (const [st, len, m] of phrase)
                lead(s16(st), m, len * S16 * 0.95, sec === 'dropA' ? 1 : 0.95);
        }
        if (sec === 'loop' && (b === 25 || b === 27))
            for (const [st, len, m] of HOOK[{ Am: 0, F: 1, C: 2, G: 3 }[CHORDS[b]] ?? 0])
                lead(s16(st), m - 12, len * S16 * 0.9, 0.55);
    }

    // sidechain: duck the music bus under every kick
    duck.gain.setValueAtTime(1, 0);
    for (const t of kicks.sort((a, b) => a - b)) {
        duck.gain.setValueAtTime(1, Math.max(0, t - 0.002));
        duck.gain.linearRampToValueAtTime(0.42, t + 0.006);
        duck.gain.linearRampToValueAtTime(1, t + 0.24);
    }

    // ---------------------------------------------------------------- the picture's cues
    const cue = {
        slam: (t, v) => {
            osc(t, 0.16, sfx, { type: 'sine', f: 140, f2: 48, gain: 0.55 * v });
            noise(t, 0.05, sfx, { type: 'bandpass', f: 2200, q: 0.8, gain: 0.3 * v });
        },
        slamBig: (t, v) => {
            osc(t, 0.4, sfx, { type: 'sine', f: 95, f2: 34, gain: 0.8 * v });
            const g = noise(t, 0.14, sfx, { type: 'lowpass', f: 5000, gain: 0.4 * v });
            send(g, 0.4);
        },
        impact: (t, v) => {
            osc(t, 1.4, sfx, { type: 'sine', f: 70, f2: 26, gain: 1.0 * v, sweepT: 1.2 });
            osc(t, 0.3, sfx, { type: 'triangle', f: 160, f2: 60, gain: 0.5 * v });
            const g = noise(t, 1.3, sfx, { type: 'lowpass', f: 7000, f2: 400, gain: 0.5 * v });
            send(g, 0.6);
            crash(t, 0.9 * v);
        },
        tick: (t) => {
            noise(t, 0.02, sfx, { type: 'bandpass', f: 2600, q: 6, gain: 0.7 });
            osc(t, 0.03, sfx, { type: 'square', f: 1800, gain: 0.06 });
        },
        zap: (t, v) => {
            const r = osc(t, 0.18, sfx, { type: 'sawtooth', f: 2400, f2: 70, gain: 0.25 * v });
            send(r.g, 0.3);
            noise(t, 0.12, sfx, { type: 'bandpass', f: 3000, q: 2, gain: 0.3 * v });
        },
        whoosh: (t, v) =>
            noise(t - 0.1, 0.4, sfx, {
                type: 'bandpass',
                f: 500,
                f2: 6500,
                q: 1.1,
                gain: 0.3 * v,
                curve: 'swell'
            }),
        type: (t, v, p) => {
            const end = t + (p || 1) * BEAT;
            const r = rng(Math.floor(t * 1000));
            for (let x = t; x < end; x += 0.035 + r() * 0.05)
                noise(x, 0.008, sfx, {
                    type: 'highpass',
                    f: 3000 + r() * 3000,
                    gain: (0.12 + r() * 0.12) * v
                });
        },
        blip: (t, v, p = 0) => {
            const f = 880 * 2 ** ((p % 12) / 12);
            osc(t, 0.06, sfx, { type: 'sine', f, f2: f * 0.8, gain: 0.18 * v });
        },
        ok: (t, v) => {
            osc(t, 0.07, sfx, { type: 'triangle', f: mtof(88), gain: 0.18 * v });
            osc(t + 0.07, 0.12, sfx, { type: 'triangle', f: mtof(93), gain: 0.2 * v });
        },
        err: (t, v) => {
            osc(t, 0.2, sfx, { type: 'square', f: 110, gain: 0.12 * v });
            osc(t, 0.2, sfx, { type: 'square', f: 116, gain: 0.12 * v });
        },
        coin: (t, v) => {
            // the game's crate "ka-ching"
            osc(t, 0.05, sfx, { type: 'square', f: 1320, gain: 0.1 * v });
            osc(t + 0.06, 0.16, sfx, { type: 'square', f: 1760, gain: 0.12 * v });
            const r = osc(t + 0.13, 0.2, sfx, { type: 'triangle', f: 2640, gain: 0.1 * v });
            send(r.g, 0.3);
        },
        glitch: (t, v) => {
            for (let k = 0; k < 4; k++)
                noise(t + k * 0.022, 0.016, sfx, {
                    type: 'bandpass',
                    f: 1500 + k * 700,
                    q: 3,
                    gain: 0.3 * v
                });
            osc(t, 0.12, sfx, { type: 'square', f: 900, f2: 90, gain: 0.08 * v });
        },
        pop: (t, v, p = 0) => {
            const f = 300 * 2 ** ((p * 2) / 12);
            osc(t, 0.12, sfx, { type: 'sine', f: f * 1.6, f2: f, gain: 0.35 * v, sweepT: 0.05 });
            noise(t, 0.02, sfx, { type: 'bandpass', f: 1800, gain: 0.2 * v });
        },
        alarm: (t) => {
            // the game's boss warning, twice, and a low hit
            for (const base of [0, BEAT]) {
                osc(t + base, 0.12, sfx, { type: 'square', f: 480, gain: 0.14 });
                osc(t + base + 0.14, 0.12, sfx, { type: 'square', f: 360, gain: 0.14 });
                osc(t + base + 0.28, 0.2, sfx, { type: 'square', f: 240, gain: 0.16 });
            }
            osc(t, 0.8, sfx, { type: 'sine', f: 60, f2: 30, gain: 0.7 });
        },
        count: (t, v, p = 2) => {
            const end = t + p * BEAT;
            let x = t;
            let k = 0;
            while (x < end) {
                const q = (x - t) / (end - t);
                osc(x, 0.02, sfx, { type: 'square', f: 600 + q * 1400, gain: 0.05 * v });
                x += 0.09 * (1 - q * 0.75);
                k++;
            }
            cue.ok(end, 0.8);
        }
    };
    for (const c of allCues(scenes)) cue[c.type]?.(c.t, c.v ?? 1, c.p);

    // ---------------------------------------------------------------- the game's own sounds (AudioEngine.tone)
    const tone = (
        t,
        {
            freq = 440,
            dur = 0.08,
            type = 'sine',
            volume = 0.2,
            attack = 0.005,
            release = 0.05,
            sweep = 0,
            isNoise = false
        }
    ) => {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(volume, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
        g.connect(game);
        if (isNoise) {
            const src = ctx.createBufferSource();
            src.buffer = noiseBuf;
            src.connect(g);
            src.start(t, R());
            src.stop(t + dur + release + 0.01);
        } else {
            const o = ctx.createOscillator();
            o.type = type;
            o.frequency.setValueAtTime(freq, t);
            if (sweep)
                o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
            o.connect(g);
            o.start(t);
            o.stop(t + dur + release + 0.01);
        }
    };
    const GAME = {
        hit: (t) => tone(t, { freq: 320, dur: 0.05, type: 'square', volume: 0.05, sweep: -120 }),
        tongue: (t) => tone(t, { freq: 260, dur: 0.07, volume: 0.1, sweep: 520 }),
        explosion: (t) => tone(t, { isNoise: true, dur: 0.25, volume: 0.12, release: 0.15 }),
        pickup: (t) => tone(t, { freq: 1200, dur: 0.06, volume: 0.04, sweep: 400 }),
        levelUp: (t) => {
            tone(t, { freq: 660, dur: 0.1, type: 'triangle', volume: 0.2 });
            tone(t + 0.09, { freq: 990, dur: 0.12, type: 'triangle', volume: 0.22 });
            tone(t + 0.2, { freq: 1320, dur: 0.18, type: 'triangle', volume: 0.24 });
        },
        bossSpawn: (t) => {
            tone(t, { isNoise: true, dur: 0.4, volume: 0.3, release: 0.25 });
            tone(t + 0.1, { freq: 80, dur: 0.6, type: 'sawtooth', volume: 0.3 });
        },
        airdrop: (t) => tone(t, { freq: 1500, dur: 0.6, volume: 0.08, sweep: -900 }),
        thud: (t) => {
            tone(t, { freq: 140, dur: 0.12, type: 'triangle', volume: 0.22, sweep: -70 });
            tone(t, { isNoise: true, dur: 0.08, volume: 0.1, release: 0.06 });
        },
        crate: (t) => {
            tone(t, { freq: 1320, dur: 0.05, type: 'square', volume: 0.12 });
            tone(t + 0.06, { freq: 1760, dur: 0.16, type: 'square', volume: 0.14 });
            tone(t + 0.13, { freq: 2640, dur: 0.2, type: 'triangle', volume: 0.1 });
        }
    };
    let lastHit = -1;
    for (const e of footageSfx(scenes, meta)) {
        if (e.n === 'hit') {
            if (e.t - lastHit < 0.07) continue;
            lastHit = e.t;
        }
        GAME[e.n]?.(e.t);
    }

    // fade the very end
    master.gain.setValueAtTime(0.5, duration - 1.2);
    master.gain.linearRampToValueAtTime(0, duration - 0.02);

    const buf = await ctx.startRendering();
    return buf;
}

/** 16-bit PCM WAV, base64 (to hand to Node). */
export function wavBase64(buf) {
    const ch = buf.numberOfChannels;
    const len = buf.length;
    const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
    const w = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF');
    data.setUint32(4, 36 + len * ch * 2, true);
    w(8, 'WAVE');
    w(12, 'fmt ');
    data.setUint32(16, 16, true);
    data.setUint16(20, 1, true);
    data.setUint16(22, ch, true);
    data.setUint32(24, buf.sampleRate, true);
    data.setUint32(28, buf.sampleRate * ch * 2, true);
    data.setUint16(32, ch * 2, true);
    data.setUint16(34, 16, true);
    w(36, 'data');
    data.setUint32(40, len * ch * 2, true);
    const chans = [...Array(ch)].map((_, i) => buf.getChannelData(i));
    let o = 44;
    for (let i = 0; i < len; i++)
        for (let c = 0; c < ch; c++) {
            const v = Math.max(-1, Math.min(1, chans[c][i]));
            data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
            o += 2;
        }
    const bytes = new Uint8Array(data.buffer);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
        s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
}

export { BPM };
