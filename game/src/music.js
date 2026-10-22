/**
 * @module music
 * @description The music's patterns as plain data, so they can be tested without Web Audio.
 * Two tracks: the calm arpeggio that plays through a run, and the boss track that takes over while a boss is
 * alive and speeds up as the boss loses HP. Each step returns the notes to play on it; `AudioEngine` plays them.
 *
 * A note: `{ freq, type, vol, attack, dur, sweep?, noise? }`. `dur` is how long it takes to fade out, `sweep` the
 * frequency it slides to, `noise` a burst of white noise instead of an oscillator (`freq` unused).
 *
 * Exports:
 *   - MUSIC                 tempo and track constants
 *   - musicMood(enemies)    { boss, heat }: heat 0 (full HP) → 1 (nearly dead), from the most hurt boss
 *   - stepMs(mood)          ms per step for that mood
 *   - calmStep(i)           notes on step i of the calm track
 *   - bossStep(i, heat)     notes on step i of the boss track
 */

export const MUSIC = {
    ROOT_HZ: 220, // A3
    CALM_MS: 180,
    BOSS_MS: 150, // a boss at full HP
    BOSS_FAST_MS: 105, // a boss on its last sliver
    CALM_STEPS: 6, // steps per bar
    BOSS_STEPS: 16,
    LEAD_AT: 0.5, // heat where the full lead line comes in
    HATS_AT: 0.75 // heat where the hats double up
};

const hz = (semis) => MUSIC.ROOT_HZ * 2 ** (semis / 12);

/** Calm: an arpeggiated minor progression, i - VI - iii - VII, with a soft bass pedal. */
const CALM_ARP = [0, 3, 7, 12, 7, 3];
const CALM_ROOTS = [0, -4, -9, -2];

/** Boss: A phrygian, i - bII - i - VII. The half step up is the menace. */
const BOSS_ROOTS = [0, 1, 0, -2];
// The lead line once the boss is past half HP, in semitones over the bar's root; null rests.
const BOSS_LEAD = [12, null, 13, 12, null, 7, null, 8, 12, null, 15, 13, null, 12, 8, 7];

/** The mood the music should be in: a live boss, and how close the most hurt one is to dying. */
export function musicMood(enemies) {
    let frac = 2;
    for (const e of enemies) {
        if (!e.boss || e.hp <= 0) continue;
        frac = Math.min(frac, e.hp / e.maxHp);
    }
    if (frac > 1.5) return { boss: false, heat: 0 };
    return { boss: true, heat: Math.max(0, Math.min(1, 1 - frac)) };
}

export function stepMs(mood) {
    if (!mood?.boss) return MUSIC.CALM_MS;
    return Math.round(MUSIC.BOSS_MS - (MUSIC.BOSS_MS - MUSIC.BOSS_FAST_MS) * mood.heat);
}

/**
 * Market Eras: each era plays the calm track in its own voice. `up`: semitones over A, `lead`: the arpeggio's
 * wave, `vol`: its level (a square is louder than a triangle at the same gain).
 */
export const ERA_VOICES = {
    genesis: { up: 0, lead: 'square', vol: 0.035 }, // 2009: chiptune
    defi: { up: 5, lead: 'triangle', vol: 0.065 }, // a warm summer fourth up
    altseason: { up: 7, lead: 'sawtooth', vol: 0.03 }, // bright and buzzy, a fifth up
    bear: { up: -3, lead: 'sine', vol: 0.07 }, // low and hollow
    // The Liquidity Pool (not an era, the same hook): soft sines a tone up, and a bubble rising on the off-beat
    pool: { up: 2, lead: 'sine', vol: 0.075, bubble: true }
};

/** Notes on step i of the calm track; `era` (a Market Eras era id) changes its key and voice. */
export function calmStep(i, era = null) {
    const step = i % MUSIC.CALM_STEPS;
    const v = ERA_VOICES[era];
    const root = CALM_ROOTS[Math.floor(i / MUSIC.CALM_STEPS) % CALM_ROOTS.length] + (v?.up || 0);
    const notes = [
        {
            freq: hz(root + CALM_ARP[step]),
            type: v?.lead || 'triangle',
            vol: v?.vol ?? 0.06,
            attack: 0.02,
            dur: 0.32
        }
    ];
    if (step % 4 === 0)
        notes.push({ freq: hz(root - 12), type: 'sine', vol: 0.04, attack: 0.03, dur: 0.6 });
    if (v?.bubble && step === 3)
        notes.push({
            freq: hz(root + 19),
            sweep: hz(root + 26),
            type: 'sine',
            vol: 0.025,
            attack: 0.005,
            dur: 0.12
        });
    return notes;
}

export function bossStep(i, heat = 0) {
    const step = i % MUSIC.BOSS_STEPS;
    const root = BOSS_ROOTS[Math.floor(i / MUSIC.BOSS_STEPS) % BOSS_ROOTS.length];
    const notes = [];
    // Kick on every beat: a sine dropping fast.
    if (step % 4 === 0)
        notes.push({ freq: 150, sweep: 45, type: 'sine', vol: 0.16, attack: 0.005, dur: 0.18 });
    // Hats on the off-beats, every other step once the boss is nearly done.
    if (step % 4 === 2 || (heat >= MUSIC.HATS_AT && step % 2 === 1))
        notes.push({ noise: true, vol: 0.03, attack: 0.002, dur: 0.04 });
    // Driving bass: eighth notes, jumping the octave on the off-beat.
    if (step % 2 === 0)
        notes.push({
            freq: hz(root - 12 + (step % 4 === 2 ? 12 : 0)),
            type: 'sawtooth',
            vol: 0.05,
            attack: 0.005,
            dur: 0.12
        });
    if (heat >= MUSIC.LEAD_AT) {
        const lead = BOSS_LEAD[step];
        if (lead !== null)
            notes.push({
                freq: hz(root + lead),
                type: 'square',
                vol: 0.03,
                attack: 0.005,
                dur: 0.1
            });
    } else if (step === 0 || step === 10) {
        // Before half HP, a sparse stab so the bar still has a top line.
        notes.push({ freq: hz(root + 12), type: 'triangle', vol: 0.05, attack: 0.01, dur: 0.24 });
    }
    return notes;
}
