/**
 * @module profile
 * @description The player's profile: lifetime stats, bests per character and per map, the player level, CLOUT
 * (the play-only currency) and the Market's cosmetics. It lives inside the one prefs save (prefs.profile), on
 * this device only. Pure functions, no DOM: game.js applies a finished run, ui.js shows it, main.js wires the
 * Market. Nothing here reaches the Simulation. The one thing CLOUT buys that plays differently is a character,
 * and picking a character is the one choice the Daily allows: the run log carries it, so the server replays it.
 *
 * CLOUT is earned only by playing. It is never bought, sold, withdrawn or traded, and it is not a coin.
 */

import { MISSION_BY_ID, defaultMissions, mergeBest, normalizeMissions } from './missions.js';

export const CURRENCY = 'CLOUT';

/** What a finished run pays, per unit. */
export const PAY = Object.freeze({
    perSeconds: 5, // 1 CLOUT per 5 s survived
    perKills: 20, // 1 CLOUT per 20 bears rekt
    boss: 30, // each boss killed
    win: 150, // ended the bear market
    bounty: 75 // cleared the AI's bounty on a Daily run
});

/** Player level: XP is the CLOUT a player has earned from runs (spending never lowers it). */
export const LEVEL = Object.freeze({ base: 200, step: 100, reward: 50 });

/**
 * The Eternal Bear: one boss that never leaves. Every run's boss damage drains its bar, across runs, until it
 * falls; then it pays a bounty and comes back with a bigger bar. The single-player slice of the holders'
 * "Global Boss Battle": a shared bar for every player needs a server, which this build doesn't have.
 */
export const ETERNAL_BEAR = Object.freeze({
    name: 'The Eternal Bear',
    baseHp: 150000,
    stepHp: 100000,
    reward: 250,
    rewardStep: 100
});

/**
 * The Market. `slot` says what an item replaces: a character's skin (`skin:<character>`), the trail, or the
 * finale (the burst when a run ends). Every slot has a free default (`price: 0`, owned from the start).
 * The `character` slot is different: its items unlock a character to play (`character`), and are owned, never
 * equipped. Which character a run plays stays in prefs.character, and the run log carries it.
 */
export const MARKET = Object.freeze([
    {
        id: 'char_bull',
        slot: 'character',
        character: 'bull',
        name: 'The Bull',
        price: 0,
        sprite: 'bull',
        text: 'Horns, 100 HP. Free, forever.'
    },
    {
        id: 'char_pepe',
        slot: 'character',
        character: 'pepe',
        name: 'Pepe',
        price: 0,
        sprite: 'pepe',
        text: 'Tongue Lash, 90 HP, 10% faster. Free, forever.'
    },
    {
        id: 'char_whale',
        slot: 'character',
        character: 'whale',
        name: 'The Whale',
        price: 750,
        sprite: 'whale_hero',
        text: 'Buy Wall shoves bears back. 120 HP, slow and big. Once a minute it sweeps every candle on screen.'
    },
    {
        id: 'bull_default',
        slot: 'skin:bull',
        name: 'The Bull',
        price: 0,
        sprite: 'bull',
        text: 'Green, horns down. The original.'
    },
    {
        id: 'bull_gold',
        slot: 'skin:bull',
        name: 'Gold Standard',
        price: 800,
        sprite: 'bull_gold',
        text: 'A solid gold bull in black shades, silver horns and a green ring. Old money, new ATH.'
    },
    {
        id: 'bull_midnight',
        slot: 'skin:bull',
        name: 'Midnight Bull',
        price: 1200,
        sprite: 'bull_midnight',
        text: 'Midnight-blue hide, gold horns, a laser eye. Trades the Asia session.'
    },
    {
        id: 'pepe_default',
        slot: 'skin:pepe',
        name: 'Pepe',
        price: 0,
        sprite: 'pepe',
        text: 'Comfy green. The original.'
    },
    {
        id: 'pepe_frost',
        slot: 'skin:pepe',
        name: 'Frost Frog',
        price: 800,
        sprite: 'pepe_frost',
        text: 'Ice-blue skin and a red knit scarf. Holds through crypto winter.'
    },
    {
        id: 'pepe_night',
        slot: 'skin:pepe',
        name: 'Night Shift Frog',
        price: 1200,
        sprite: 'pepe_night',
        text: 'Violet skin, gold shades with a glow. Hasn’t slept since the halving.'
    },
    {
        id: 'whale_default',
        slot: 'skin:whale',
        name: 'The Whale',
        price: 0,
        sprite: 'whale_hero',
        text: 'Deep blue, gold chain. The original.'
    },
    {
        id: 'trail_none',
        slot: 'trail',
        name: 'No Trail',
        price: 0,
        icon: 'dca',
        text: 'Just dust.'
    },
    {
        id: 'trail_candles',
        slot: 'trail',
        name: 'Green Candles',
        price: 500,
        icon: 'green_candle',
        fx: { color: '#16E08A', kind: 'spark', n: 2, size: 3 },
        text: 'Every step prints a green candle spark.'
    },
    {
        id: 'trail_gold',
        slot: 'trail',
        name: 'Gold Dust',
        price: 700,
        icon: 'compounding',
        fx: { color: '#FFC53D', kind: 'ember', n: 2, size: 3 },
        text: 'Leaves a wake of gold embers. Subtle, like a flex.'
    },
    {
        id: 'finale_none',
        slot: 'finale',
        name: 'Plain Exit',
        price: 0,
        icon: 'hedge',
        text: 'The usual shake when the run ends.'
    },
    {
        id: 'finale_confetti',
        slot: 'finale',
        name: 'Green Confetti',
        price: 600,
        icon: 'airdrop',
        fx: { colors: ['#16E08A', '#7BF5A6', '#FFC53D', '#FFFFFF'], ring: '22,224,138' },
        text: 'Go out like a launch party: green and gold confetti.'
    },
    {
        id: 'finale_supernova',
        slot: 'finale',
        name: 'Supernova',
        price: 900,
        icon: 'hopium',
        fx: { colors: ['#FFC53D', '#FFE08A', '#FF7A1A', '#FFF6D6'], ring: '255,197,61' },
        text: 'A gold ring and a starburst. Liquidated, but iconic.'
    }
]);

export const MARKET_BY_ID = Object.freeze(Object.fromEntries(MARKET.map((i) => [i.id, i])));
const UNLOCK = 'character';
const DEFAULTS = Object.freeze(
    Object.fromEntries(
        MARKET.filter((i) => i.price === 0 && i.slot !== UNLOCK).map((i) => [i.slot, i.id])
    )
);
const FREE = Object.freeze(MARKET.filter((i) => i.price === 0).map((i) => i.id));

export function defaultProfile() {
    return {
        v: 1,
        clout: 0, // the balance
        earned: 0, // lifetime CLOUT from runs, levels and the Eternal Bear: the player's XP comes from runs only
        xp: 0,
        level: 1,
        runs: 0,
        timeMs: 0,
        kills: 0,
        bossKills: 0,
        bossDamage: 0,
        wins: 0,
        bounties: 0,
        best: { character: {}, stage: {} }, // id -> { score, timeMs }
        owned: [...FREE],
        equipped: { ...DEFAULTS },
        bear: { tier: 1, damage: 0, felled: 0 },
        missions: defaultMissions() // missions.js: done, best progress, done but not paid yet
    };
}

const num = (v, min = 0) => (Number.isFinite(v) && v >= min ? v : min);

/**
 * Any saved shape (missing, from an older build, hand-edited) → a valid profile. Unknown items are dropped,
 * numbers are clamped, the free defaults are always owned. Never throws.
 */
export function normalizeProfile(raw) {
    const p = defaultProfile();
    if (!raw || typeof raw !== 'object') return p;
    for (const k of [
        'clout',
        'earned',
        'xp',
        'runs',
        'timeMs',
        'kills',
        'bossKills',
        'bossDamage',
        'wins',
        'bounties'
    ])
        p[k] = Math.floor(num(raw[k]));
    p.level = levelForXp(p.xp).level;
    for (const kind of ['character', 'stage']) {
        const src = raw.best?.[kind];
        if (!src || typeof src !== 'object') continue;
        for (const [id, b] of Object.entries(src)) {
            if (!/^[a-z_]{1,24}$/.test(id) || !b) continue;
            p.best[kind][id] = { score: num(b.score), timeMs: num(b.timeMs) };
        }
    }
    const owned = new Set(p.owned);
    if (Array.isArray(raw.owned)) for (const id of raw.owned) if (MARKET_BY_ID[id]) owned.add(id);
    p.owned = MARKET.map((i) => i.id).filter((id) => owned.has(id));
    for (const [slot, id] of Object.entries(raw.equipped || {})) {
        const item = MARKET_BY_ID[id];
        if (item && item.slot === slot && slot !== UNLOCK && owned.has(id)) p.equipped[slot] = id;
    }
    const bear = raw.bear || {};
    p.bear = {
        tier: Math.max(1, Math.floor(num(bear.tier, 1))),
        damage: Math.floor(num(bear.damage)),
        felled: Math.floor(num(bear.felled))
    };
    p.bear.damage = Math.min(p.bear.damage, bearHp(p.bear.tier) - 1);
    p.missions = normalizeMissions(raw.missions);
    return p;
}

/** XP needed to go from `level` to the next one. */
export function xpToNext(level) {
    return LEVEL.base + LEVEL.step * (level - 1);
}

/** Total XP → { level, into (XP into this level), need (XP this level takes) }. */
export function levelForXp(xp) {
    let level = 1;
    let left = Math.max(0, Math.floor(xp) || 0);
    while (left >= xpToNext(level)) {
        left -= xpToNext(level);
        level++;
    }
    return { level, into: left, need: xpToNext(level) };
}

export function bearHp(tier) {
    return ETERNAL_BEAR.baseHp + ETERNAL_BEAR.stepHp * (tier - 1);
}

/**
 * What a run pays, line by line (the receipt counts them up in this order). `summary` is Simulation.summary().
 * @returns {{lines: {id:string, label:string, detail:string, v:number}[], total:number}}
 */
export function runPayout(summary, { bountyCleared = false } = {}) {
    const secs = Math.floor((summary.timeMs || 0) / 1000);
    const kills = summary.kills || 0;
    const bosses = summary.bossKills || 0;
    const lines = [
        {
            id: 'time',
            label: 'SURVIVED',
            detail: `${secs}s`,
            v: Math.floor(secs / PAY.perSeconds)
        },
        {
            id: 'kills',
            label: 'BEARS REKT',
            detail: `${kills}`,
            v: Math.floor(kills / PAY.perKills)
        }
    ];
    // CLOUT the bull picked up off the map (smashed piggy banks): banked as it was found
    const found = Math.max(0, Math.floor(Number(summary.clout) || 0));
    if (found) lines.push({ id: 'found', label: 'CLOUT FOUND', detail: '', v: found });
    if (bosses)
        lines.push({ id: 'bosses', label: 'BOSSES', detail: `×${bosses}`, v: bosses * PAY.boss });
    if (summary.won) lines.push({ id: 'win', label: 'BEAR MARKET ENDED', detail: '', v: PAY.win });
    if (bountyCleared) lines.push({ id: 'bounty', label: 'AI BOUNTY', detail: '', v: PAY.bounty });
    return { lines, total: lines.reduce((a, l) => a + l.v, 0) };
}

/**
 * Bank a finished run into the profile. Returns a new profile and what happened, for the receipt. `missionBest` is
 * the run's mission progress (missions.js tracker `best`); missions already marked done are paid here.
 * @returns {{profile: object, payout: object, before: object, after: object, levelUps: number[],
 *           levelReward: number, bear: {damage:number, hp:number, before:number, after:number, tier:number,
 *           felled:number, reward:number}}}
 */
export function applyRun(profile, summary, { bountyCleared = false, missionBest = null } = {}) {
    const p = normalizeProfile(profile);
    const payout = runPayout(summary, { bountyCleared });
    // Missions done (this run, or one whose tab closed before its receipt) pay once, a line each
    const missions = [];
    for (const id of p.missions.unpaid) {
        const m = MISSION_BY_ID[id];
        missions.push(m);
        payout.lines.push({ id: 'mission', label: 'MISSION', detail: m.name, v: m.reward });
        payout.total += m.reward;
    }
    p.missions = mergeBest({ ...p.missions, unpaid: [] }, missionBest || {});
    payout.missions = missions;
    const before = levelForXp(p.xp);
    p.runs++;
    p.timeMs += Math.max(0, summary.timeMs || 0);
    p.kills += Math.max(0, summary.kills || 0);
    p.bossKills += Math.max(0, summary.bossKills || 0);
    p.bossDamage += Math.max(0, Math.round(summary.bossDamage || 0));
    if (summary.won) p.wins++;
    if (bountyCleared) p.bounties++;
    const best = (kind, id) => {
        if (!id) return;
        const cur = p.best[kind][id];
        if (
            !cur ||
            summary.score > cur.score ||
            (summary.score === cur.score && summary.timeMs > cur.timeMs)
        )
            p.best[kind][id] = { score: summary.score || 0, timeMs: summary.timeMs || 0 };
    };
    best('character', summary.character || 'bull');
    best('stage', summary.stage);

    // the run's CLOUT, then the XP it brings, then a bonus for every level crossed
    p.clout += payout.total;
    p.earned += payout.total;
    p.xp += payout.total;
    const after = levelForXp(p.xp);
    const levelUps = [];
    for (let l = before.level + 1; l <= after.level; l++) levelUps.push(l);
    const levelReward = levelUps.length * LEVEL.reward;
    p.clout += levelReward;
    p.earned += levelReward;
    p.level = after.level;

    // the Eternal Bear: boss damage drains its bar; a felled bear pays and returns bigger
    let dmg = Math.max(0, Math.round(summary.bossDamage || 0));
    const bear = { damage: dmg, tier: p.bear.tier, before: p.bear.damage, felled: 0, reward: 0 };
    while (dmg > 0) {
        const hp = bearHp(p.bear.tier);
        const take = Math.min(dmg, hp - p.bear.damage);
        p.bear.damage += take;
        dmg -= take;
        if (p.bear.damage >= hp) {
            bear.felled++;
            bear.reward += ETERNAL_BEAR.reward + ETERNAL_BEAR.rewardStep * (p.bear.tier - 1);
            p.bear.felled++;
            p.bear.tier++;
            p.bear.damage = 0;
        }
    }
    p.clout += bear.reward;
    p.earned += bear.reward;
    bear.after = p.bear.damage;
    bear.hp = bearHp(p.bear.tier);
    bear.tier = p.bear.tier;
    return { profile: p, payout, before, after, levelUps, levelReward, bear };
}

/** Buy an item. Returns { ok, profile, error }; the profile is unchanged unless ok. */
export function buy(profile, id) {
    const p = normalizeProfile(profile);
    const item = MARKET_BY_ID[id];
    if (!item) return { ok: false, profile: p, error: 'unknown' };
    if (p.owned.includes(id)) return { ok: false, profile: p, error: 'owned' };
    if (p.clout < item.price) return { ok: false, profile: p, error: 'short' };
    p.clout -= item.price;
    p.owned = MARKET.map((i) => i.id).filter((x) => x === id || p.owned.includes(x));
    if (item.slot !== UNLOCK) p.equipped[item.slot] = id; // a new thing goes on right away
    return { ok: true, profile: p, error: null };
}

/** Equip an owned item in its slot. Character unlocks aren't equipped (prefs.character picks the run's). */
export function equip(profile, id) {
    const p = normalizeProfile(profile);
    const item = MARKET_BY_ID[id];
    if (!item || item.slot === UNLOCK || !p.owned.includes(id)) return { ok: false, profile: p };
    p.equipped[item.slot] = id;
    return { ok: true, profile: p };
}

/** The Market item that unlocks a character, or null if nothing sells it. */
export function unlockItem(character) {
    return MARKET.find((i) => i.slot === UNLOCK && i.character === character) || null;
}

/** Can this profile play `character`? Free characters always; a priced one once its unlock is owned. */
export function characterUnlocked(profile, character) {
    const item = unlockItem(character);
    return !item || item.price === 0 || !!profile?.owned?.includes(item.id);
}

/** The sprite a character wears (its skin if one is equipped), or null for the character's own. */
export function skinSprite(profile, character) {
    const id = profile?.equipped?.[`skin:${character}`];
    const item = MARKET_BY_ID[id];
    return item && item.price > 0 && profile.owned?.includes(id) ? item.sprite : null;
}

/** The equipped item in a slot (trail, finale), or null for the free default. */
export function equippedItem(profile, slot) {
    const item = MARKET_BY_ID[profile?.equipped?.[slot]];
    return item && item.price > 0 && profile.owned?.includes(item.id) ? item : null;
}
