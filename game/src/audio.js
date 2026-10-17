/**
 * @module audio
 * @description Web Audio synthesised SFX plus a procedural music loop.
 * Zero external assets — every sound is generated at playback time from
 * oscillators and noise buffers. Music is a step sequencer playing the
 * patterns in `music.js`: a calm arpeggio, and a boss track while a boss lives.
 *
 * Dependencies: browser Web Audio API. Degrades silently when unavailable.
 *
 * Exports:
 *   - class AudioEngine
 */

import { bossStep, calmStep, stepMs } from './music.js';

export class AudioEngine {
    constructor(settings) {
        this.settings = settings;
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.musicGain = null;
        this.musicInterval = null;
        this.musicStepIndex = 0;
        this.mood = { boss: false, heat: 0 };
        this.enabled = true;
        this.unlocked = false;
    }

    init() {
        if (this.ctx) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) {
                this.enabled = false;
                return;
            }
            this.ctx = new AC();
            this.masterGain = this.ctx.createGain();
            this.sfxGain = this.ctx.createGain();
            this.musicGain = this.ctx.createGain();
            this.sfxGain.connect(this.masterGain);
            this.musicGain.connect(this.masterGain);
            this.masterGain.connect(this.ctx.destination);
            this.applyVolumes();
        } catch (err) {
            console.warn('[audio] disabled', err);
            this.enabled = false;
        }
    }

    unlock() {
        if (!this.ctx) this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {
                /* ignore */
            });
        }
        this.unlocked = true;
    }

    applyVolumes() {
        if (!this.ctx) return;
        const s = this.settings;
        // iter-13: a global `muted` flag (toggled by the M hotkey) zeroes the
        // master gain without overwriting masterVolume so unmute restores
        // exactly what the player had before.
        const muteMult = s.muted ? 0 : 1;
        this.masterGain.gain.value = (s.masterVolume ?? 0.6) * muteMult;
        this.sfxGain.gain.value = s.sfxVolume ?? 0.8;
        this.musicGain.gain.value = (s.musicEnabled === false ? 0 : 1) * (s.musicVolume ?? 0.4);
    }

    /** Toggle a global mute (zeroes master gain, leaves volumes intact). */
    setMuted(flag) {
        this.settings.muted = !!flag;
        this.applyVolumes();
    }

    // Generic tone helper --------------------------------------------------
    tone({
        freq = 440,
        dur = 0.08,
        type = 'sine',
        volume = 0.2,
        attack = 0.005,
        release = 0.05,
        sweep = 0,
        noise = false
    }) {
        if (!this.enabled || !this.ctx || !this.unlocked) return;
        const now = this.ctx.currentTime;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur + release);
        gain.connect(this.sfxGain);

        let source;
        if (noise) {
            source = this.ctx.createBufferSource();
            source.buffer = this._noiseBuffer();
        } else {
            const osc = this.ctx.createOscillator();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, now);
            if (sweep) {
                osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), now + dur);
            }
            source = osc;
        }
        source.connect(gain);
        source.start(now);
        source.stop(now + dur + release + 0.01);
    }

    _noiseBuffer() {
        if (this._noise) return this._noise;
        const len = this.ctx.sampleRate * 0.4;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this._noise = buf;
        return buf;
    }

    // High-level SFX -------------------------------------------------------
    hit() {
        this.tone({ freq: 320, dur: 0.05, type: 'square', volume: 0.12, sweep: -120 });
    }
    shoot() {
        this.tone({ freq: 780, dur: 0.04, type: 'triangle', volume: 0.08, sweep: -200 });
    }
    /** Tongue Lash: a quick wet "thwip", rising. */
    tongue() {
        this.tone({ freq: 260, dur: 0.07, type: 'sine', volume: 0.14, sweep: 520 });
    }
    /** Bear Spray: a short aerosol hiss with a low pop of the valve under it. */
    spray() {
        this.tone({ noise: true, dur: 0.16, volume: 0.09, attack: 0.01, release: 0.08 });
        this.tone({ freq: 140, dur: 0.05, type: 'triangle', volume: 0.08, sweep: -40 });
    }
    /** Honey Trap: a soft glass "tink" as the jar breaks, then a wet low splat. */
    honey() {
        this.tone({ freq: 1500, dur: 0.04, type: 'triangle', volume: 0.07, sweep: -500 });
        this.tone({ freq: 120, dur: 0.14, type: 'sine', volume: 0.16, sweep: -50 });
        this.tone({ noise: true, dur: 0.09, volume: 0.06, attack: 0.01, release: 0.06 });
    }
    /** A grizzly sits down to eat: two quick low "noms". */
    nom() {
        this.tone({ freq: 180, dur: 0.06, type: 'triangle', volume: 0.12, sweep: -40 });
        setTimeout(
            () => this.tone({ freq: 160, dur: 0.07, type: 'triangle', volume: 0.12, sweep: -40 }),
            110
        );
    }
    /** A grizzly's shield breaks: a bright glassy crack falling away. */
    shieldBreak() {
        this.tone({ freq: 1900, dur: 0.07, type: 'square', volume: 0.07, sweep: -900 });
        setTimeout(
            () => this.tone({ freq: 1250, dur: 0.12, type: 'triangle', volume: 0.1, sweep: -700 }),
            40
        );
        this.tone({ noise: true, dur: 0.06, volume: 0.08 });
    }
    explosion() {
        this.tone({ noise: true, dur: 0.25, volume: 0.22, release: 0.15 });
    }
    pickup() {
        this.tone({ freq: 1200, dur: 0.06, type: 'sine', volume: 0.12, sweep: 400 });
    }
    levelUp() {
        this.tone({ freq: 660, dur: 0.1, type: 'triangle', volume: 0.2 });
        setTimeout(() => this.tone({ freq: 990, dur: 0.12, type: 'triangle', volume: 0.22 }), 90);
        setTimeout(() => this.tone({ freq: 1320, dur: 0.18, type: 'triangle', volume: 0.24 }), 200);
    }
    /** The receipt counts CLOUT up: a short bright tick, a little higher each call. */
    cloutTick() {
        this._tickN = ((this._tickN || 0) + 1) % 12;
        this.tone({ freq: 1400 + this._tickN * 40, dur: 0.025, type: 'square', volume: 0.05 });
    }
    /** A Market purchase: a register "ka-ching", two bright notes over a soft thump. */
    buy() {
        this.tone({ freq: 140, dur: 0.06, type: 'triangle', volume: 0.14, sweep: -40 });
        this.tone({ freq: 1760, dur: 0.06, type: 'triangle', volume: 0.14 });
        setTimeout(() => this.tone({ freq: 2640, dur: 0.16, type: 'sine', volume: 0.16 }), 70);
    }
    /** Equip, or a tab in the Market: a soft click. */
    click() {
        this.tone({ freq: 900, dur: 0.02, type: 'triangle', volume: 0.07 });
    }
    /** Not enough CLOUT: a low double buzz. */
    deny() {
        this.tone({ freq: 160, dur: 0.06, type: 'square', volume: 0.08 });
        setTimeout(() => this.tone({ freq: 130, dur: 0.08, type: 'square', volume: 0.08 }), 80);
    }
    damage() {
        this.tone({ freq: 180, dur: 0.18, type: 'sawtooth', volume: 0.18, sweep: -80 });
    }
    death() {
        this.tone({ freq: 220, dur: 0.4, type: 'sawtooth', volume: 0.25, sweep: -180 });
        setTimeout(
            () => this.tone({ freq: 110, dur: 0.6, type: 'sawtooth', volume: 0.2, sweep: -80 }),
            200
        );
    }
    bossSpawn() {
        this.tone({ noise: true, dur: 0.4, volume: 0.3, release: 0.25 });
        setTimeout(() => this.tone({ freq: 80, dur: 0.6, type: 'sawtooth', volume: 0.3 }), 100);
    }
    bossWarn() {
        // Three-note descending "alert" — used in the boss banner lead-in.
        this.tone({ freq: 480, dur: 0.12, type: 'square', volume: 0.2 });
        setTimeout(() => this.tone({ freq: 360, dur: 0.12, type: 'square', volume: 0.2 }), 140);
        setTimeout(() => this.tone({ freq: 240, dur: 0.2, type: 'square', volume: 0.22 }), 280);
    }
    /** An airdrop crate on its way: a falling whistle. */
    airdrop() {
        this.tone({ freq: 1500, dur: 0.6, type: 'sine', volume: 0.08, sweep: -900 });
    }
    /** A crate hits the ground. */
    thud() {
        this.tone({ freq: 140, dur: 0.12, type: 'triangle', volume: 0.22, sweep: -70 });
        this.tone({ noise: true, dur: 0.08, volume: 0.1, release: 0.06 });
    }
    /** A crate pops open: a register "ka-ching". */
    crate() {
        this.tone({ freq: 1320, dur: 0.05, type: 'square', volume: 0.12 });
        setTimeout(() => this.tone({ freq: 1760, dur: 0.16, type: 'square', volume: 0.14 }), 60);
        setTimeout(() => this.tone({ freq: 2640, dur: 0.2, type: 'triangle', volume: 0.1 }), 130);
    }
    /** Boss Jackpot: a slot machine paying out, a run of coins climbing to a bright chord. */
    jackpot() {
        const notes = [784, 988, 1175, 1568, 1319, 1568, 2093];
        notes.forEach((f, i) =>
            setTimeout(
                () => this.tone({ freq: f, dur: 0.07, type: 'square', volume: 0.1 }),
                180 + i * 70
            )
        );
        setTimeout(
            () => {
                this.tone({ freq: 1047, dur: 0.5, type: 'triangle', volume: 0.16 });
                this.tone({ freq: 1568, dur: 0.5, type: 'triangle', volume: 0.12 });
            },
            180 + notes.length * 70
        );
    }
    /** God Candle: a rising whoosh as it falls, then a huge low slam and a bright major chord on top. */
    godCandle() {
        this.tone({ freq: 300, dur: 0.28, type: 'sine', volume: 0.12, sweep: 1200 });
        setTimeout(() => {
            this.tone({ noise: true, dur: 0.35, volume: 0.3, release: 0.25 });
            this.tone({ freq: 90, dur: 0.6, type: 'sawtooth', volume: 0.26, sweep: -50 });
            for (const f of [523, 659, 784, 1047])
                this.tone({ freq: f, dur: 0.6, type: 'triangle', volume: 0.08, release: 0.3 });
        }, 300);
    }
    /** Moon Rocket: ignition (a noise burst) and a long rising roar, with a bright chirp at the top. */
    rocket() {
        this.tone({ noise: true, dur: 0.5, volume: 0.22, release: 0.35 });
        this.tone({ freq: 110, dur: 0.9, type: 'sawtooth', volume: 0.14, sweep: 330 });
        setTimeout(
            () => this.tone({ freq: 1320, dur: 0.18, type: 'square', volume: 0.07, sweep: 660 }),
            420
        );
    }
    /** Moon Rocket rams a bear: a short punchy thud. */
    ram() {
        this.tone({ freq: 160, dur: 0.1, type: 'square', volume: 0.14, sweep: -100 });
        this.tone({ noise: true, dur: 0.06, volume: 0.12, release: 0.05 });
    }
    /** Withdrawal Freeze ices a candle: a tiny high glassy tick. */
    freeze() {
        this.tone({ freq: 2400, dur: 0.04, type: 'triangle', volume: 0.05, sweep: -600 });
    }
    /** Withdrawals reopen: ice cracking, then a bright rising run as the candles fly home. */
    thaw() {
        this.tone({ noise: true, dur: 0.2, volume: 0.18, release: 0.12 });
        this.tone({ freq: 1800, dur: 0.1, type: 'square', volume: 0.07, sweep: -1000 });
        [659, 880, 1175, 1568, 2093].forEach((f, i) =>
            setTimeout(
                () => this.tone({ freq: f, dur: 0.08, type: 'triangle', volume: 0.12 }),
                160 + i * 60
            )
        );
    }
    /** Buy the Dip: the chart drops (a falling note), then bounces back up in a quick bright V. */
    dip() {
        this.tone({ freq: 880, dur: 0.16, type: 'square', volume: 0.09, sweep: -520 });
        setTimeout(() => this.tone({ freq: 440, dur: 0.1, type: 'triangle', volume: 0.16 }), 170);
        setTimeout(() => this.tone({ freq: 660, dur: 0.1, type: 'triangle', volume: 0.18 }), 250);
        setTimeout(() => this.tone({ freq: 990, dur: 0.22, type: 'triangle', volume: 0.2 }), 330);
    }
    /** A kill inside the dip heals: a tiny rising blip. */
    dipHeal() {
        this.tone({ freq: 700, dur: 0.05, type: 'sine', volume: 0.07, sweep: 500 });
    }
    /** Liquidation Risk: a crit arcs to the next bear, a short electric zap that falls. */
    liquidation() {
        this.tone({ freq: 1400, dur: 0.07, type: 'square', volume: 0.06, sweep: -900 });
        this.tone({ noise: true, dur: 0.03, volume: 0.08, release: 0.03 });
    }
    /** Pump and Dump pops: a sharp balloon crack, then the chart deflating (a falling whistle). */
    dump() {
        this.tone({ noise: true, dur: 0.05, volume: 0.24, release: 0.04 });
        this.tone({ freq: 900, dur: 0.32, type: 'square', volume: 0.07, sweep: -760 });
    }
    /** A charge boss crouches over its ring: a two-beep margin-call alarm, the second one higher. */
    leapWarn() {
        this.tone({ freq: 660, dur: 0.12, type: 'square', volume: 0.08 });
        setTimeout(() => this.tone({ freq: 880, dur: 0.16, type: 'square', volume: 0.08 }), 180);
    }
    /** It lands: a deep thud with a crunch of noise on top. */
    leapLand() {
        this.tone({ freq: 90, dur: 0.35, type: 'sine', volume: 0.3, sweep: -50 });
        this.tone({ noise: true, dur: 0.12, volume: 0.18, release: 0.1 });
    }
    /** A jackpot candle lands: a small coin clink. */
    coin() {
        this.tone({ freq: 2200 + Math.random() * 500, dur: 0.04, type: 'triangle', volume: 0.06 });
    }
    /** Rug Lord grips the rug: a low rising rumble. */
    rugWarn() {
        this.tone({ freq: 70, dur: 0.5, type: 'sawtooth', volume: 0.14, sweep: 60 });
    }
    /** The rug is yanked: a cloth "fwip" of noise over a falling sweep. */
    rugPull() {
        this.tone({ noise: true, dur: 0.22, volume: 0.2, release: 0.12 });
        this.tone({ freq: 900, dur: 0.3, type: 'triangle', volume: 0.12, sweep: -700 });
    }
    /** A doomposter starts typing: three quick keyboard clicks. */
    typing() {
        for (let i = 0; i < 3; i++) {
            setTimeout(
                () => this.tone({ freq: 2400 - i * 200, dur: 0.02, type: 'square', volume: 0.05 }),
                i * 120
            );
        }
    }
    /** Whale Alert: a long, low call that bends up and back down. */
    whaleCall() {
        this.tone({ freq: 110, dur: 0.7, type: 'sine', volume: 0.22, sweep: 90 });
        setTimeout(
            () => this.tone({ freq: 200, dur: 0.9, type: 'sine', volume: 0.18, sweep: -110 }),
            650
        );
    }
    /** The whale shoulders through the crowd: a soft splash. */
    whaleSplash() {
        this.tone({ noise: true, dur: 0.16, volume: 0.1, release: 0.12 });
        this.tone({ freq: 420, dur: 0.1, type: 'sine', volume: 0.06, sweep: -260 });
    }
    /** Buy Wall rolls out: a low swell of water with a soft order-book tick on top. */
    wall() {
        this.tone({ freq: 140, dur: 0.28, type: 'sine', volume: 0.12, sweep: 70 });
        this.tone({ noise: true, dur: 0.14, volume: 0.05, release: 0.12 });
        this.tone({ freq: 1320, dur: 0.03, type: 'triangle', volume: 0.04 });
    }
    /** Sweep the Book: a big gulp (a falling sine), then a run of rising clinks as the candles pour in. */
    sweep() {
        this.tone({ freq: 260, dur: 0.3, type: 'sine', volume: 0.2, sweep: -170 });
        for (let i = 0; i < 5; i++) {
            setTimeout(
                () =>
                    this.tone({ freq: 1400 + i * 220, dur: 0.05, type: 'triangle', volume: 0.06 }),
                160 + i * 55
            );
        }
    }
    /** Exit Scam pockets a candle: a quick sly "swish" down. */
    scamGrab() {
        this.tone({ freq: 1600, dur: 0.06, type: 'triangle', volume: 0.07, sweep: -900 });
    }
    /** Exit Scam runs for it: a cartoon getaway, quick footsteps climbing in pitch. */
    scamRun() {
        for (let i = 0; i < 4; i++) {
            setTimeout(
                () => this.tone({ freq: 330 + i * 110, dur: 0.05, type: 'square', volume: 0.09 }),
                i * 70
            );
        }
    }
    /** Busted: a drum hit, then the bag's coins pouring out. */
    scamBust() {
        this.tone({ freq: 120, dur: 0.14, type: 'triangle', volume: 0.22, sweep: -60 });
        for (let i = 0; i < 5; i++) {
            setTimeout(
                () =>
                    this.tone({ freq: 1800 + i * 160, dur: 0.05, type: 'triangle', volume: 0.07 }),
                80 + i * 50
            );
        }
    }
    /** It got away: a sad two-note slide down. */
    scamGone() {
        this.tone({ freq: 520, dur: 0.18, type: 'square', volume: 0.08, sweep: -120 });
        setTimeout(
            () => this.tone({ freq: 360, dur: 0.32, type: 'square', volume: 0.08, sweep: -160 }),
            200
        );
    }
    achievement() {
        this.tone({ freq: 880, dur: 0.08, type: 'triangle', volume: 0.18 });
        setTimeout(() => this.tone({ freq: 1174, dur: 0.1, type: 'triangle', volume: 0.2 }), 70);
        setTimeout(() => this.tone({ freq: 1567, dur: 0.14, type: 'triangle', volume: 0.22 }), 150);
    }

    // Procedural music: two step-sequenced tracks from `music.js`. The calm arpeggio plays through a run; the
    // boss track takes over while a boss is alive and speeds up as it loses HP. Each step reschedules the
    // next one, so the tempo can change between steps.
    startMusic() {
        if (!this.enabled || !this.ctx || this.musicInterval) return;
        if (this.settings.musicEnabled === false) return;
        this.unlock();
        const next = () => {
            if (!this.ctx) return;
            this._musicStep();
            this.musicInterval = setTimeout(next, stepMs(this.mood));
        };
        this.musicInterval = setTimeout(next, stepMs(this.mood));
    }

    /** Tell the music what's on screen: `{ boss, heat }` from `musicMood`. A change of track starts on a downbeat. */
    setMood(mood) {
        const boss = !!mood?.boss;
        if (boss !== this.mood.boss) this.musicStepIndex = 0;
        this.mood = { boss, heat: boss ? mood.heat : 0 };
    }

    /** Play one step of the current track and move on. */
    _musicStep() {
        const i = this.musicStepIndex++;
        const notes = this.mood.boss ? bossStep(i, this.mood.heat) : calmStep(i);
        for (const n of notes) this._note(n);
    }

    _note(n) {
        const now = this.ctx.currentTime;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(n.vol, now + n.attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.dur);
        let src;
        if (n.noise) {
            src = this.ctx.createBufferSource();
            src.buffer = this._noiseBuffer();
        } else {
            src = this.ctx.createOscillator();
            src.type = n.type;
            src.frequency.setValueAtTime(n.freq, now);
            if (n.sweep) src.frequency.exponentialRampToValueAtTime(n.sweep, now + n.dur);
        }
        src.connect(gain).connect(this.musicGain);
        src.start(now);
        src.stop(now + n.dur + 0.02);
    }

    stopMusic() {
        if (this.musicInterval) {
            clearTimeout(this.musicInterval);
            this.musicInterval = null;
        }
    }

    toggleMusic(on) {
        this.settings.musicEnabled = !!on;
        this.applyVolumes();
        if (on) this.startMusic();
        else this.stopMusic();
    }
}
