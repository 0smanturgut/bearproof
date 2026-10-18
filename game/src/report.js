/**
 * @module report
 * @description Run reports for the screens, read from the simulation and never written back to it:
 *  - the damage report on the game-over receipt: damage per source, summed from the sim's `dmg` events, plus the
 *    hits the sim deals quietly (no event: Hopium's cloud, the God Candle's and Short Squeeze's wipes), from the
 *    `stats.damageDealt` counter;
 *  - the build sheet on the pause screen: the loadout and the player's real stat multipliers.
 * No DOM here, so both are unit-tested (test/report.test.js).
 */

import { CRATE_LOOT, PASSIVES, PICKUPS, SIM, WEAPONS } from './sim/content.js';

const WEAPON_BY_ID = Object.fromEntries(Object.values(WEAPONS).map((d) => [d.id, d]));
const PASSIVE_BY_ID = Object.fromEntries(Object.values(PASSIVES).map((d) => [d.id, d]));

/**
 * Damage that doesn't come from a weapon: the `src` the sim tags it with, its label and icon. `crate` sources are
 * one-off bursts, so they get no DPS.
 */
export const OTHER_SOURCES = Object.freeze({
    liquidation: { name: PASSIVES.LEVERAGE.evolveName, icon: 'leverage', tag: 'CHAIN' },
    god_candle: { name: CRATE_LOOT.god_candle.name, icon: 'god_candle', tag: 'CRATE', crate: true },
    moon_rocket: {
        name: CRATE_LOOT.moon_rocket.name,
        icon: 'moon_rocket',
        tag: 'CRATE',
        crate: true
    },
    squeeze: { name: PICKUPS.squeeze.name, icon: 'pk_squeeze', tag: 'LOOT', crate: true }
});

const titleCase = (id) =>
    String(id)
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

const evolvedWeapon = (def, level) => !!def?.evolveLevel && level >= def.evolveLevel;

/**
 * Accumulates one run's damage by source. Call `observe(sim)` once when the run starts, then
 * `observe(sim, events)` with every batch of events drained from the sim (after each step and each pick).
 */
export function createDamageReport() {
    const damage = Object.create(null); // src -> damage dealt
    const since = Object.create(null); // src -> sim time it was first held (weapons) or first hit
    let counted = 0; // the part of stats.damageDealt already attributed
    const add = (src, v, t) => {
        if (!(v > 0)) return;
        damage[src] = (damage[src] || 0) + v;
        if (!(src in since)) since[src] = t;
    };
    return {
        damage,
        since,
        observe(sim, events = []) {
            const p = sim.player;
            const t = sim.time;
            for (const w of p.weapons) if (!(w.id in since)) since[w.id] = t;
            // Liquidation Risk's clock starts when Leverage evolves, not at its first chain.
            if (!('liquidation' in since) && p.evolvedPassive?.('leverage')) since.liquidation = t;
            let loud = 0;
            let wipe = null;
            for (const e of events) {
                if (e.t === 'dmg') {
                    add(e.src, e.v, t);
                    loud += e.v;
                } else if (e.t === 'godCandle') wipe = 'god_candle';
                else if (e.t === 'squeeze') wipe = 'squeeze'; // a Short Squeeze pickup wipes quietly too
            }
            const dealt = sim.stats.damageDealt || 0;
            const quiet = dealt - counted - loud;
            counted = dealt;
            if (quiet > 1e-6) {
                const src = wipe || p.weapons.find((w) => w.def?.type === 'aura')?.id;
                if (src) add(src, quiet, t);
            }
        },
        /**
         * The report's rows, biggest first: { id, name, icon, level, evolved, tag, damage, share, dps }.
         * `dps` is damage per second held (null for a crate's burst). `more` counts the rows past `max`.
         */
        rows(sim, { max = 6 } = {}) {
            const end = sim.time;
            const total = Object.values(damage).reduce((a, v) => a + v, 0);
            const all = Object.keys(damage)
                .map((id) => {
                    const v = damage[id];
                    const w = sim.player.weapons.find((x) => x.id === id);
                    const def = WEAPON_BY_ID[id];
                    const other = OTHER_SOURCES[id];
                    const level = w ? w.level : null;
                    const evolved = def ? evolvedWeapon(def, level) : id === 'liquidation';
                    const held = Math.max(1, end - (since[id] ?? 0));
                    return {
                        id,
                        name: def
                            ? evolved
                                ? def.evolveName
                                : def.name
                            : other?.name || titleCase(id),
                        icon: def?.icon || other?.icon || id,
                        level,
                        evolved,
                        tag: other?.tag || null,
                        damage: v,
                        share: total > 0 ? v / total : 0,
                        dps: other?.crate ? null : v / held
                    };
                })
                .sort((a, b) => b.damage - a.damage || (a.id < b.id ? -1 : 1));
            return { total, rows: all.slice(0, max), more: Math.max(0, all.length - max) };
        }
    };
}

const pct = (mult) => {
    const v = Math.round((mult - 1) * 100);
    return v === 0 ? '0%' : `${v > 0 ? '+' : ''}${v}%`;
};
const tone = (mult, higherIsBetter = true) => {
    const v = Math.round((mult - 1) * 100);
    if (v === 0) return 'flat';
    return v > 0 === higherIsBetter ? 'up' : 'down';
};

/**
 * The pause screen's build sheet: weapons and passives in the order they were taken, and the player's stats as
 * the sim computes them (the same getters it uses). A stat that is still at its base reads 0% and is shown
 * calm; ARMOR, REGEN, DODGE and DMG TAKEN only appear once something changes them.
 */
export function buildSheet(sim) {
    const p = sim.player;
    const weapons = p.weapons.map((w) => {
        const def = WEAPON_BY_ID[w.id] || w.def || {};
        const evolved = evolvedWeapon(def, w.level);
        return {
            id: w.id,
            name: evolved ? def.evolveName : def.name || titleCase(w.id),
            base: def.name || titleCase(w.id),
            icon: def.icon || w.id,
            level: w.level,
            max: SIM.WEAPON_MAX_LEVEL,
            evolved
        };
    });
    const passives = p.passiveOrder.map((id) => {
        const def = PASSIVE_BY_ID[id] || p.passives[id].def || {};
        const count = p.passives[id].count;
        const evolved = !!def.evolveName && count >= SIM.PASSIVE_MAX_STACK;
        return {
            id,
            name: evolved ? def.evolveName : def.name || titleCase(id),
            base: def.name || titleCase(id),
            icon: def.icon || id,
            count,
            max: SIM.PASSIVE_MAX_STACK,
            evolved
        };
    });

    const printer = p.printerTimer > 0 ? p.printerMult || 1 : 1; // a crate's 10 s, not part of the build
    const speed =
        p.getSpeedMult() *
        (sim.stageMods?.playerSpeedMult || 1) *
        (sim.twist?.playerSpeedMult || 1);
    const cooldown = p.getCooldownMult() / printer;
    const magnet = p.getMagnetRange() / SIM.MAGNET_BASE;
    const crit = p.getCritChance();
    const stats = [
        {
            id: 'hp',
            label: 'MAX HP',
            value: String(Math.round(p.maxHp)),
            tone: p.maxHp > p.baseMaxHp + 1e-9 ? 'up' : ''
        },
        {
            id: 'damage',
            label: 'DAMAGE',
            value: pct(p.getDamageMult()),
            tone: tone(p.getDamageMult())
        },
        { id: 'cooldown', label: 'COOLDOWN', value: pct(cooldown), tone: tone(cooldown, false) },
        { id: 'area', label: 'AREA', value: pct(p.getAreaMult()), tone: tone(p.getAreaMult()) },
        { id: 'speed', label: 'SPEED', value: pct(speed), tone: tone(speed) },
        { id: 'magnet', label: 'MAGNET', value: pct(magnet), tone: tone(magnet) },
        {
            id: 'crit',
            label: 'CRIT',
            value: `${Math.round(crit * 100)}%`,
            tone: crit > 0 ? 'up' : 'flat'
        },
        { id: 'xp', label: 'XP GAIN', value: pct(p.getExpMult()), tone: tone(p.getExpMult()) }
    ];
    const armor = p.getArmor();
    if (armor > 0) stats.push({ id: 'armor', label: 'ARMOR', value: `-${armor}/HIT`, tone: 'up' });
    let regen = 0;
    for (const id of p.passiveOrder) {
        const e = p.passives[id].def?.effect?.hpRegen;
        if (e) regen += e * p.passives[id].count;
    }
    if (regen > 0)
        stats.push({ id: 'regen', label: 'REGEN', value: `${+regen.toFixed(1)}/S`, tone: 'up' });
    const dodge = p.getDodgeChance();
    if (dodge > 0)
        stats.push({
            id: 'dodge',
            label: 'DODGE',
            value: `${Math.round(dodge * 100)}%`,
            tone: 'up'
        });
    const taken = (1 - p.getDamageReduction()) * p.getDamageTakenMult();
    if (Math.round((taken - 1) * 100) !== 0)
        stats.push({
            id: 'taken',
            label: 'DMG TAKEN',
            value: pct(taken),
            tone: tone(taken, false)
        });

    return {
        weapons,
        passives,
        stats,
        slots: { weapons: SIM.MAX_WEAPONS, passives: SIM.MAX_PASSIVES }
    };
}
