/**
 * @module guide
 * @description The Field Guide's pages, built from the game's own data (sim/content.js), so a new weapon, passive,
 * bear or boss shows up here the night it ships, with the same numbers the simulation uses. No DOM: ui.js renders
 * what this returns.
 */

import {
    BOSSES,
    CHARACTERS,
    CHARACTER_IDS,
    ENEMIES,
    PASSIVES,
    SIM,
    STAGE_ROTATION,
    WAVES,
    WEAPONS,
    bossesFor,
    getStage
} from './sim/content.js';
import { fmtNum } from './format.js';

/** Seconds as m:ss. */
export function clock(sec) {
    return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

const num = (x) => String(Math.round(x * 100) / 100);

/** When a bear first joins the waves, in the default market: "From 1:30 (Rug Season)", or null if it never does. */
export function firstSeen(id) {
    const w = WAVES.find((wave) => wave.pool.includes(id));
    return w ? `From ${clock(w.from)} (${w.label})` : null;
}

/** When a boss arrives, across the Daily stages: "5:00 (4:00 in Bear Trap)", "10:00, Crypto Winter only". */
export function bossArrival(id) {
    const times = STAGE_ROTATION.map((s) => ({
        stage: getStage(s).name,
        at: bossesFor(s).find((b) => b.id === id)?.spawnAt
    }));
    const present = times.filter((t) => t.at != null);
    if (!present.length) return null;
    if (present.length === 1) return `${clock(present[0].at)}, ${present[0].stage} only`;
    const count = (at) => present.filter((t) => t.at === at).length;
    const main = present.reduce((m, t) => (count(t.at) > count(m) ? t.at : m), present[0].at);
    const odd = present.filter((t) => t.at !== main).map((t) => `${clock(t.at)} in ${t.stage}`);
    const missing = times.filter((t) => t.at == null).map((t) => `not in ${t.stage}`);
    return [clock(main), odd.length ? `(${odd.join(', ')})` : '', missing.join(', ')]
        .filter(Boolean)
        .join(' ')
        .replace(' not', ', not');
}

function weaponEntry(w) {
    const starters = CHARACTER_IDS.filter((c) => CHARACTERS[c].starterWeapon === w.id).map((c) =>
        CHARACTERS[c].name.replace(/^The /, '')
    );
    const tags = [];
    if (w.character) tags.push(`${CHARACTERS[w.character]?.name || w.character} only`);
    if (starters.length) tags.push(`${starters.join(' & ')}'s starter`);
    return {
        id: w.id,
        name: w.name,
        art: w.icon,
        tags,
        text: w.description,
        stats: `${num(w.baseDamage)} dmg · every ${num(w.baseCooldown)} s · reach ${num(w.baseRange)}`,
        extra: w.evolveName
            ? `Lv ${w.evolveLevel || SIM.WEAPON_MAX_LEVEL} → ${w.evolveName}: ${w.evolveDescription || ''}`.trim()
            : `No evolution: tops out at Lv ${SIM.WEAPON_MAX_LEVEL}.`,
        evolves: !!w.evolveName
    };
}

function passiveEntry(p) {
    return {
        id: p.id,
        name: p.name,
        art: p.icon,
        tags: [],
        text: p.description,
        stats: `Stacks up to ${SIM.PASSIVE_MAX_STACK}×`,
        extra: null
    };
}

function enemyEntry(e) {
    const from = [];
    for (const b of Object.values(BOSSES))
        if (b.summon === e.id) from.push(`called in by ${b.name}`);
    for (const s of Object.values(ENEMIES))
        if (s.splitInto === e.id) from.push(`splits out of ${s.name}`);
    // Exit Scam isn't in the waves; it walks in on its own clock
    const seen = e.thief
        ? `From ${clock(SIM.SCAM_FIRST)}, one every ${SIM.SCAM_EVERY} s`
        : firstSeen(e.id);
    const when = [seen, ...from].filter(Boolean).join(' · ');
    return {
        id: e.id,
        name: e.name,
        art: e.sprite,
        tags: when ? [when.charAt(0).toUpperCase() + when.slice(1)] : [],
        text: e.description || '',
        stats: `${fmtNum(e.hp)} HP · hits ${num(e.damage)} · speed ${num(e.speed)}`,
        extra: e.tip ? `Tip: ${e.tip}` : null
    };
}

function bossEntry(b) {
    const at = bossArrival(b.id);
    const jackpot = b.exp * SIM.BOSS_SCORE_MULT * SIM.BOSS_JACKPOT_MULT;
    return {
        id: b.id,
        name: b.name,
        art: b.sprite,
        tags: at ? [`Arrives ${at}`] : [],
        text: b.description || b.tagline || '',
        stats: `${fmtNum(b.hp)} HP · hits ${num(b.damage)} · jackpot ${fmtNum(jackpot)}`,
        extra: b.tagline ? `“${b.tagline}”` : null
    };
}

/** The guide's tabs, in order. Every weapon, passive, bear and boss in content.js appears exactly once. */
export function guideSections() {
    return [
        {
            id: 'weapons',
            label: 'Weapons',
            intro: `Up to ${SIM.MAX_WEAPONS} at once. Every level up to ${SIM.WEAPON_MAX_LEVEL}: +20% damage, 8% faster, 10% more reach. ${Object.values(WEAPONS).every((w) => w.evolveName) ? 'Every one evolves' : 'Most evolve'} at Lv ${SIM.WEAPON_MAX_LEVEL}.`,
            entries: Object.values(WEAPONS).map(weaponEntry)
        },
        {
            id: 'passives',
            label: 'Passives',
            intro: `Up to ${SIM.MAX_PASSIVES} at once. Pick one again to stack it.`,
            entries: Object.values(PASSIVES).map(passiveEntry)
        },
        {
            id: 'bears',
            label: 'Bears',
            intro: 'Times are for the plain market. The Daily stage changes the mix, and its twist changes the numbers.',
            entries: Object.values(ENEMIES).map(enemyEntry)
        },
        {
            id: 'bosses',
            label: 'Bosses',
            intro: `A boss kill pays its jackpot in score and rains gold candles. Beat ${Object.values(BOSSES).find((b) => b.final)?.name || 'the final boss'} to win.`,
            entries: Object.values(BOSSES).map(bossEntry)
        }
    ];
}
