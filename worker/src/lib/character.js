import { CHARACTER_IDS } from '../../../game/src/sim/content.js';

/**
 * The character a run was played with, from its log header: 'B' 'R', format, sim version, seed (4 bytes), twist,
 * then (format 3+) the character's index in CHARACTER_IDS, which is append-only. Older logs are the bull.
 */
export function characterOf(headHex) {
    const b = String(headHex || '').match(/../g) || [];
    if (b.length < 10 || b[0] !== '42' || b[1] !== '52' || parseInt(b[2], 16) < 3) return 'bull';
    return CHARACTER_IDS[parseInt(b[9], 16)] || 'bull';
}
