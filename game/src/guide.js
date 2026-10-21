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
    GOLD_SHARE,
    PASSIVES,
    PICKUPS,
    PIGGY_LOOT,
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
            ? `Lv ${w.evolveLevel || SIM.WEAPON_MAX_LEVEL}${catalystName(w) ? ` + ${catalystName(w)}` : ''} → ${w.evolveName}: ${w.evolveDescription || ''}`.trim()
            : `No evolution: tops out at Lv ${SIM.WEAPON_MAX_LEVEL}.`,
        evolves: !!w.evolveName
    };
}

const catalystName = (w) => Object.values(PASSIVES).find((p) => p.id === w.evolveWith)?.name;

/** The Evolutions tab: what a weapon (or passive) becomes and its recipe. */
function evolutionEntry(d) {
    const isWeapon = Object.values(WEAPONS).includes(d);
    const who = d.character ? `${CHARACTERS[d.character]?.name || d.character} only` : null;
    const recipe = isWeapon
        ? `${d.name} Lv ${d.evolveLevel}${catalystName(d) ? ` + ${catalystName(d)}` : ''}`
        : `${d.name} ×${SIM.PASSIVE_MAX_STACK}`;
    return {
        id: d.id,
        name: d.evolveName,
        art: isWeapon ? `evo_${d.id}` : d.icon,
        tags: who ? [who] : [],
        text: d.evolveDescription || '',
        stats: `Recipe: ${recipe}`,
        evolves: true
    };
}

/** A collectible not met yet: its hint tags stay, the rest is hidden and its art is a silhouette. */
function locked(e, hint) {
    return {
        ...e,
        name: '???',
        text: hint,
        // an evolution keeps its recipe: that's how you find it
        stats: e.stats?.startsWith('Recipe:') ? e.stats : null,
        extra: null,
        evolves: false,
        locked: true,
        silhouette: true
    };
}

/** Lock what `seen[kind]` doesn't have yet; `seen` null = the plain guide, all open. */
function collect(entries, kind, seen, hint) {
    if (!seen) return entries;
    const have = new Set(seen[kind] || []);
    return entries.map((e) => (have.has(e.id) ? e : locked(e, hint)));
}

const counted = (section, seen) => {
    if (!seen) return section;
    const found = section.entries.filter((e) => !e.locked).length;
    const total = section.entries.length;
    return {
        ...section,
        count: `${found}/${total}`,
        intro: `Found ${found} of ${total}. ${section.intro}`
    };
};

function passiveEntry(p) {
    return {
        id: p.id,
        name: p.name,
        art: p.icon,
        tags: [],
        text: p.description,
        stats: `Stacks up to ${SIM.PASSIVE_MAX_STACK}×`,
        extra: p.evolveName
            ? `${SIM.PASSIVE_MAX_STACK}× → ${p.evolveName}: ${p.evolveDescription || ''}`.trim()
            : null,
        evolves: !!p.evolveName
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

const pct = (x) => `${Math.round(x * 100)}%`;

/** A piggy bank's odds of dropping `id` (PIGGY_LOOT weights), e.g. "30%"; null if it never does. */
export function dropChance(id) {
    const total = PIGGY_LOOT.reduce((a, l) => a + l.weight, 0);
    const l = PIGGY_LOOT.find((x) => x.id === id);
    return l && total ? pct(l.weight / total) : null;
}

/** The line of numbers under a pickup (the rest of what it does is its description). */
function pickupStats(p) {
    const wait = `waits ${SIM.PICKUP_LIFE} s on the floor`;
    if (p.heal) return `+${p.heal} HP · ${wait}`;
    if (p.clout) return `+${p.clout} CLOUT, banked with the run · ${wait}`;
    if (p.duration)
        return `${num(p.duration)} s${p.bossSlow ? ` · bosses ${pct(p.bossSlow)} slower` : ''} · ${wait}`;
    if (p.radius)
        return `Reach ${fmtNum(p.radius)}${p.bossShare ? ` · bosses lose ${pct(p.bossShare)} HP` : ''} · ${wait}`;
    return wait.charAt(0).toUpperCase() + wait.slice(1);
}

/**
 * The Loot tab: the piggy bank, everything it drops (PIGGY_LOOT order; the gold candle isn't a PICKUP, it's an
 * XP candle), the boss chest, and what the scenery does. Every PICKUPS entry appears exactly once.
 */
function lootEntries() {
    const finalBoss = Object.values(BOSSES).find((b) => b.final);
    const entries = [
        {
            id: 'piggy_bank',
            name: 'Piggy Bank',
            art: 'piggy_bank',
            tags: ['On every map'],
            text: 'Smash it with anything, or run into it. Out falls one of the pickups below.',
            stats: PIGGY_LOOT.map(
                (l) => `${PICKUPS[l.id]?.name || 'Gold Candle'} ${dropChance(l.id)}`
            ).join(' · '),
            extra: 'Each one breaks once a run.'
        }
    ];
    const seen = new Set();
    const pickup = (p) => {
        seen.add(p.id);
        const chance = dropChance(p.id);
        return {
            id: p.id,
            name: p.name,
            art: p.sprite,
            tags: chance ? [`${chance} of piggy banks`] : [],
            text: p.description,
            stats: pickupStats(p)
        };
    };
    for (const l of PIGGY_LOOT) {
        if (PICKUPS[l.id]) entries.push(pickup(PICKUPS[l.id]));
        else if (l.id === 'gold')
            entries.push({
                id: 'gold',
                name: 'Gold Candle',
                art: 'xp_candle_big',
                tags: [`${dropChance('gold')} of piggy banks`],
                text: 'A fat XP candle. Grab it before the bears crowd it.',
                stats: `Worth ${pct(GOLD_SHARE)} of your next level`
            });
    }
    if (PICKUPS.chest) {
        seen.add('chest');
        const c = PICKUPS.chest;
        entries.push({
            id: 'chest',
            name: c.name,
            art: c.sprite,
            tags: [finalBoss ? `Every boss but ${finalBoss.name}` : 'Every boss'],
            text: c.description,
            stats: `${pct(SIM.CHEST_TRIPLE)} hold three · waits ${SIM.CHEST_LIFE} s`
        });
    }
    // anything new in PICKUPS that no piggy bank drops yet still gets its row
    for (const p of Object.values(PICKUPS)) if (!seen.has(p.id)) entries.push(pickup(p));
    const flyers = Object.values(ENEMIES)
        .filter((e) => e.flies)
        .map((e) => `${e.name}s`);
    entries.push({
        id: 'scenery',
        name: 'Scenery',
        art: 'chop_pine_small',
        scale: 1,
        tags: ['Solid'],
        text: `Trees, walls and wrecks are solid. Bosses${flyers.length ? ` and ${flyers.join(' and ')}` : ''} fly over them.`,
        stats: 'Bears have to walk around it too.'
    });
    return entries;
}

/**
 * The guide's tabs, in order. Every weapon, passive, bear, boss and pickup in content.js appears exactly once, and
 * every evolution once more on its own tab. With `seen` (profile.seen, collection.js) it's the Collection: what the
 * player hasn't met yet is locked, and each collected tab counts found/total.
 */
export function guideSections(seen = null) {
    const evolutions = [
        ...Object.values(WEAPONS).filter((w) => w.evolveName),
        ...Object.values(PASSIVES).filter((p) => p.evolveName)
    ];
    return [
        counted(
            {
                id: 'weapons',
                label: 'Weapons',
                intro: `Up to ${SIM.MAX_WEAPONS} at once. Every level up to ${SIM.WEAPON_MAX_LEVEL}: +20% damage, 8% faster, 10% more reach. ${Object.values(WEAPONS).every((w) => w.evolveName) ? 'Every one evolves' : 'Most evolve'} at Lv ${SIM.WEAPON_MAX_LEVEL} with its catalyst passive.`,
                entries: collect(
                    Object.values(WEAPONS).map(weaponEntry),
                    'weapons',
                    seen,
                    'Not found yet. Take it from a level-up card.'
                )
            },
            seen
        ),
        counted(
            {
                id: 'evolutions',
                label: 'Evolved',
                intro: `A weapon evolves at Lv ${SIM.WEAPON_MAX_LEVEL} once you also hold its catalyst passive, in either order. The level-up card tells you.`,
                entries: collect(
                    evolutions.map(evolutionEntry),
                    'evolutions',
                    seen,
                    'Not evolved yet. Follow the recipe.'
                )
            },
            seen
        ),
        counted(
            {
                id: 'passives',
                label: 'Passives',
                intro: `Up to ${SIM.MAX_PASSIVES} at once. Pick one again to stack it.${Object.values(PASSIVES).some((p) => p.evolveName) ? ` Some evolve at ${SIM.PASSIVE_MAX_STACK}×.` : ''}`,
                entries: collect(
                    Object.values(PASSIVES).map(passiveEntry),
                    'passives',
                    seen,
                    'Not found yet. Take it from a level-up card.'
                )
            },
            seen
        ),
        counted(
            {
                id: 'bears',
                label: 'Bears',
                intro: 'Times are for the plain market. The Daily stage changes the mix, and its twist changes the numbers.',
                entries: collect(
                    Object.values(ENEMIES).map(enemyEntry),
                    'bears',
                    seen,
                    'Not met yet. Survive longer, or try another map.'
                )
            },
            seen
        ),
        counted(
            {
                id: 'bosses',
                label: 'Bosses',
                intro: `A boss kill pays its jackpot in score and rains gold candles. Beat ${Object.values(BOSSES).find((b) => b.final)?.name || 'the final boss'} to win.`,
                entries: collect(
                    Object.values(BOSSES).map(bossEntry),
                    'bosses',
                    seen,
                    'Not met yet.'
                )
            },
            seen
        ),
        {
            id: 'loot',
            label: 'Loot',
            intro: `Piggy banks sit all over every map. Smash one and walk over what falls out: it waits ${SIM.PICKUP_LIFE} s. Bosses leave a chest.`,
            entries: lootEntries()
        }
    ];
}
