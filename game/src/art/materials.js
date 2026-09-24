// Material ramps for the BEARPROOF pixel-art engine (art/pixel.js). Six tones, darkest first, hue-shifted
// the way pixel artists do it: shadows lean cool, highlights lean warm, so the sprites glow instead of
// going grey. `line` is the selective outline: the darkest hue of the material, never flat black.

import { mat } from './pixel.js';

export const M = {
    // The bull and everything bullish
    bull: mat(['#06261F', '#0A5C45', '#0E9A64', '#16E08A', '#7BF5A6', '#D8FFD0'], {
        line: '#03140F'
    }),
    bullDeep: mat(['#041A14', '#073A2C', '#0A5C45', '#0E7F57', '#12A56E', '#34C98A'], {
        line: '#020C09'
    }),
    snout: mat(['#0A4A3A', '#138A64', '#3FCB91', '#8CF2BF', '#C8FFE0', '#F2FFF6'], {
        line: '#03140F'
    }),
    hoof: mat(['#070C0B', '#0F1A18', '#1B2B28', '#2A413C', '#3E5C55', '#5A7D74'], {
        line: '#030605'
    }),
    horn: mat(['#3B2F1C', '#6E5A38', '#A08758', '#CDB787', '#EDE0BC', '#FFFBEA'], {
        line: '#1E170C'
    }),

    // Pepe the frog: a warmer, yellower green than the bull, a pale belly, brick-red lips, a pink tongue
    frog: mat(['#0C2210', '#1C4A1E', '#2F7A2E', '#4FAA3E', '#86D25E', '#CFF39A'], {
        line: '#061208'
    }),
    frogBelly: mat(['#2A4A22', '#4F7A3A', '#7FA85A', '#AFCF84', '#D6EDB0', '#F2FFDC'], {
        line: '#0E1A0A'
    }),
    lip: mat(['#2E0E0A', '#5E1F16', '#8E3624', '#B8543A', '#DB7A5C', '#F6A88A'], {
        line: '#1A0605'
    }),
    tongue: mat(['#4A0E22', '#8A1E44', '#C83A6A', '#FF6E9C', '#FFA3C0', '#FFD8E4'], {
        line: '#2A0614'
    }),

    // Bears, candles and everything bearish
    bear: mat(['#2B0714', '#6E0F2A', '#B81E40', '#FF3B5C', '#FF7E86', '#FFC9BF'], {
        line: '#1A040C'
    }),
    bearDark: mat(['#1A040C', '#3D0918', '#6E0F2A', '#962038', '#BD3348', '#E0525F'], {
        line: '#0F0207'
    }),
    fur: mat(['#1E0D0A', '#43200F', '#6E3A1E', '#9A5A30', '#C98A55', '#EBC08E'], {
        line: '#120705'
    }),
    furDark: mat(['#140608', '#2E0D12', '#4F1620', '#74222C', '#9E3A3A', '#C9685A'], {
        line: '#0A0304'
    }),
    belly: mat(['#3A1E12', '#6E3F26', '#A8683E', '#D9955F', '#F2BE8A', '#FFE3C2'], {
        line: '#1E0F08'
    }),

    // Neutrals
    gold: mat(['#3A2200', '#7A4B00', '#C28100', '#FFC53D', '#FFE08A', '#FFF6D6'], {
        line: '#221400'
    }),
    metal: mat(['#14181E', '#2A3038', '#46505C', '#6E7A88', '#A3ACB8', '#E3E8EE'], {
        line: '#0A0C10'
    }),
    cloth: mat(['#0B0D12', '#151922', '#212733', '#313949', '#465063', '#646F86'], {
        line: '#050608'
    }),
    hood: mat(['#120E1C', '#1F1830', '#2E2447', '#41345F', '#584A7C', '#776A9C'], {
        line: '#08060E'
    }),
    fud: mat(['#140E22', '#2A1F45', '#443270', '#6B55A0', '#9A86C8', '#CBBFE6'], {
        line: '#0A0714'
    }),
    paper: mat(['#4A4F5A', '#7C8390', '#AEB5C0', '#D5DAE1', '#EEF1F5', '#FFFFFF'], {
        line: '#1F232B'
    }),
    burlap: mat(['#2A1A0C', '#4E3217', '#7A5025', '#A37038', '#C9964F', '#E6BE7A'], {
        line: '#170E06'
    }),
    skin: mat(['#3A1E12', '#6E3F26', '#A8683E', '#D9955F', '#F2BE8A', '#FFE3C2'], {
        line: '#1E0F08'
    }),
    wood: mat(['#24120A', '#4A2614', '#74401F', '#9E5E2E', '#C88645', '#E8B574'], {
        line: '#140A05'
    }),

    // Cold and electric
    ice: mat(['#061A2E', '#0E3D66', '#1C6FA8', '#46B8F0', '#9BE2FF', '#E8FAFF'], {
        line: '#030E1A'
    }),
    snow: mat(['#34465C', '#5E7690', '#8FA8C0', '#BFD2E4', '#E4EEF8', '#FFFFFF'], {
        line: '#18222F'
    }),
    diamond: mat(['#0A2F4A', '#1467A0', '#27A6E8', '#6FD8FF', '#C4F2FF', '#FFFFFF'], {
        line: '#051826'
    }),

    // Glowing bits (flat, emissive)
    eyeRed: mat(['#FF3B5C'], { line: '#1A040C', glow: '#FF3B5C' }),
    eyeGold: mat(['#FFC53D'], { line: '#221400', glow: '#FFC53D' }),
    eyeIce: mat(['#9BE2FF'], { line: '#030E1A', glow: '#46B8F0' })
};

// Single colours used for hand-placed details
export const C = {
    ink: '#07090C',
    white: '#FFFFFF',
    eyeWhite: '#F4F7FA',
    pupil: '#07090C',
    red: '#FF3B5C',
    redGlow: '#FF6B80',
    gold: '#FFC53D',
    goldLight: '#FFE9A8',
    green: '#16E08A',
    mint: '#B8FFD9',
    ice: '#9BE2FF'
};
