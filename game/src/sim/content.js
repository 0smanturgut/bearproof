/**
 * @module sim/content
 * @description Everything the game is *about*, as plain data: weapons, passives, enemies, bosses, the wave
 * director and stages. Behaviour lives in sim/weapons.js and sim/entities.js; a new weapon, enemy or boss
 * that reuses an existing archetype is a data-only change here.
 *
 * Numbers are inherited from the upstream balance (see game/BALANCE.md) so Build #1 changes the theme,
 * not the feel. Sprite / icon ids refer to game/src/art/sprites.js.
 */

export const SIM = Object.freeze({
    TICK_RATE: 60,
    DT: 1 / 60,
    MAX_TICKS: 60 * 60 * 20, // 20 minutes: the market closes
    PLAYER_SPEED: 240,
    PLAYER_SIZE: 18,
    PLAYER_HP: 100,
    MAX_ENEMIES: 300,
    // Bears spawn just past the edge of the view (~1100x720 on a desktop, ~520x1100 on a phone), so the
    // first ones are on screen within seconds; at 900 the first bear took ~7 s to show up and ~11 s to arrive.
    SPAWN_RADIUS: 700,
    BOSS_SPAWN_RADIUS: 720,
    // The opening bell: at 0.5 s a ring of the first wave's bears closes in from just off screen.
    OPENING_TICK: 30,
    OPENING_RING: 6,
    OPENING_RADIUS: 580,
    DESPAWN_RADIUS: 1250,
    XP_LIFETIME: 30,
    INVINCIBILITY: 0.5,
    PICKUP_DISTANCE: 26,
    MAGNET_BASE: 120,
    MAX_WEAPONS: 6,
    MAX_PASSIVES: 6,
    WEAPON_MAX_LEVEL: 5,
    PASSIVE_MAX_STACK: 5,
    SCORE_PER_SECOND: 10,
    BOSS_SCORE_MULT: 5,
    WIN_BONUS: 25000,
    // Airdrop crates: the first at 0:40, then one a minute. Each lands on screen (inside ~260 px of the bull,
    // the half-width of a phone's view), floats down, then waits a while before the bears loot it.
    CRATE_FIRST: 40,
    CRATE_EVERY: 60,
    CRATE_DIST_MIN: 170,
    CRATE_DIST_MAX: 240,
    CRATE_FALL: 2,
    CRATE_LIFE: 25,
    CRATE_PICKUP: 30
});

// ---------------------------------------------------------------- airdrop crates

/**
 * What an airdrop crate holds. A crate's loot is rolled when it drops, never the same as the one before.
 * `duration` is in seconds; `cooldownMult` scales every weapon's cooldown while the printer runs.
 */
export const CRATE_LOOT_IDS = ['magnet', 'shield', 'printer'];

export const CRATE_LOOT = {
    magnet: {
        id: 'magnet',
        name: 'Magnet',
        toast: 'MAGNET: EVERY CANDLE IS YOURS',
        description: 'Every candle on the chart flies to you.'
    },
    shield: {
        id: 'shield',
        name: 'Shield',
        toast: 'SHIELD: 8 S UNREKTABLE',
        description: '8 s of no damage.',
        duration: 8
    },
    printer: {
        id: 'printer',
        name: 'Money Printer',
        toast: 'MONEY PRINTER GO BRRR',
        description: '10 s of weapons firing twice as fast.',
        duration: 10,
        cooldownMult: 0.5
    }
};

// ---------------------------------------------------------------------------
// Weapons. Scaling is uniform: damage +20%/level, cooldown x0.92/level, range +10%/level.
// Reaching WEAPON_MAX_LEVEL (5) evolves the weapon.
// ---------------------------------------------------------------------------
export const WEAPONS = {
    HORNS: {
        id: 'horns',
        name: 'Horns',
        icon: 'horns',
        description: 'Gore bears on both sides of you.',
        type: 'melee',
        baseDamage: 20,
        baseCooldown: 1.5,
        baseRange: 90,
        projectileCount: 1,
        evolveLevel: 5,
        evolveName: 'Stampede',
        evolveDescription: 'A full-circle sweep.'
    },
    GREEN_CANDLE: {
        id: 'green_candle',
        name: 'Green Candle',
        icon: 'green_candle',
        sprite: 'green_candle',
        description: 'A green candle that homes in on the nearest bear.',
        type: 'projectile',
        baseDamage: 15,
        baseCooldown: 1.2,
        baseRange: 320,
        projectileCount: 1,
        speed: 420,
        homing: true,
        evolveLevel: 5,
        evolveName: 'God Candle',
        evolveDescription: 'Two extra candles per volley.',
        evolveExtraCount: 2
    },
    LASER_EYES: {
        id: 'laser_eyes',
        name: 'Laser Eyes',
        icon: 'laser_eyes',
        sprite: 'laser',
        description: 'Piercing lasers at the nearest bear.',
        type: 'projectile',
        baseDamage: 12,
        baseCooldown: 0.4,
        baseRange: 420,
        projectileCount: 1,
        speed: 620,
        piercing: true,
        evolveLevel: 5,
        evolveName: 'Full Send',
        evolveDescription: 'A five-beam fan with +10% crit.',
        evolveMinCount: 5,
        evolveBonusCrit: 0.1
    },
    DIAMOND_HANDS: {
        id: 'diamond_hands',
        name: 'Diamond Hands',
        icon: 'diamond_hands',
        sprite: 'diamond',
        description: 'Diamonds orbit you and never let go.',
        type: 'orbit',
        baseDamage: 16,
        baseCooldown: 0.4,
        baseRange: 120,
        projectileCount: 2,
        piercing: true,
        evolveLevel: 5,
        evolveName: 'Unbreakable',
        evolveDescription: 'Twice the diamonds, +10% damage.',
        evolveDamageMult: 1.1
    },
    AIRDROP: {
        id: 'airdrop',
        name: 'Airdrop',
        icon: 'airdrop',
        sprite: 'airdrop',
        description: 'Drops a crate on a random bear. Lv3+: the blast chains.',
        type: 'instant',
        baseDamage: 35,
        baseCooldown: 3.0,
        baseRange: 420,
        chain: true,
        chainFromLevel: 3,
        chainCount: 3,
        chainRange: 180,
        evolveLevel: 5,
        evolveName: 'Carpet Drop',
        evolveDescription: 'Three crates per drop, +15% crit.',
        evolveBonusCrit: 0.15
    },
    LIMIT_ORDER: {
        id: 'limit_order',
        name: 'Limit Order',
        icon: 'limit_order',
        sprite: 'limit_order',
        description: 'Places an order at your feet. It fills in 1.2s and blows up nearby bears.',
        type: 'mine',
        baseDamage: 45,
        baseCooldown: 2.2,
        baseRange: 100,
        fuse: 1.2,
        evolveLevel: 5,
        evolveName: 'Iceberg Order',
        evolveDescription: 'Places a second, hidden order nearby.'
    },
    HOPIUM: {
        id: 'hopium',
        name: 'Hopium',
        icon: 'hopium',
        description: 'A cloud of hopium that burns bears near you.',
        type: 'aura',
        baseDamage: 5,
        baseCooldown: 0.2,
        baseRange: 110
    },
    CIRCUIT_BREAKER: {
        id: 'circuit_breaker',
        name: 'Circuit Breaker',
        icon: 'circuit_breaker',
        description: 'Halts trading: a shockwave that damages and freezes bears.',
        type: 'nova',
        baseDamage: 28,
        baseCooldown: 3.2,
        baseRange: 200,
        slowPct: 0.5,
        slowDuration: 1.2,
        evolveLevel: 5,
        evolveName: 'Market Halt',
        evolveDescription: 'A second shockwave follows the first.'
    },
    BUYBACK: {
        id: 'buyback',
        name: 'Buyback',
        icon: 'buyback',
        description: 'Drains the nearest bear and heals you for 25% of it.',
        type: 'drain',
        baseDamage: 8,
        baseCooldown: 0.25,
        baseRange: 260,
        lifestealPct: 0.25,
        evolveLevel: 5,
        evolveName: 'Treasury Buyback',
        evolveDescription: 'Drains two bears at once.'
    },
    DEAD_CAT_BOUNCE: {
        id: 'dead_cat_bounce',
        name: 'Dead Cat Bounce',
        icon: 'dead_cat_bounce',
        sprite: 'dead_cat',
        description: 'Thrown forward. It always comes back.',
        type: 'projectile',
        baseDamage: 18,
        baseCooldown: 1.1,
        baseRange: 340,
        projectileCount: 1,
        speed: 380,
        piercing: true,
        boomerang: true,
        evolveLevel: 5,
        evolveName: 'Double Bounce',
        evolveDescription: 'Throws faster.',
        evolveCooldownMult: 0.95
    },
    // Pepe's signature weapon. `character` limits a weapon to that character's level-up cards.
    TONGUE: {
        id: 'tongue',
        name: 'Tongue Lash',
        icon: 'tongue',
        description: 'Lashes at the nearest bear and hits every bear in the line.',
        type: 'tongue',
        character: 'pepe',
        baseDamage: 22,
        baseCooldown: 1.0,
        baseRange: 230,
        width: 16,
        evolveLevel: 5,
        evolveName: 'Liquidity Grab',
        evolveDescription: 'Three tongues in a fan.',
        evolveFan: 3
    }
};

export const STARTER_WEAPON = 'horns';

// ---------------------------------------------------------------------------
// Passives. Stack up to PASSIVE_MAX_STACK. `effect` keys are read by Player.
// ---------------------------------------------------------------------------
export const PASSIVES = {
    THICK_SKIN: {
        id: 'thick_skin',
        name: 'Thick Skin',
        icon: 'thick_skin',
        description: 'Max HP +20%',
        effect: { maxHpMult: 0.2 }
    },
    DCA: {
        id: 'dca',
        name: 'DCA',
        icon: 'dca',
        description: 'Regenerate 0.5 HP/s. Slow and steady.',
        effect: { hpRegen: 0.5 }
    },
    COLD_WALLET: {
        id: 'cold_wallet',
        name: 'Cold Wallet',
        icon: 'cold_wallet',
        description: 'Damage taken -1',
        effect: { armor: 1 }
    },
    MOMENTUM: {
        id: 'momentum',
        name: 'Momentum',
        icon: 'momentum',
        description: 'Move speed +10%',
        effect: { speedMult: 0.1 }
    },
    CONVICTION: {
        id: 'conviction',
        name: 'Conviction',
        icon: 'conviction',
        description: 'Damage +10%',
        effect: { damageMult: 0.1 }
    },
    LIQUIDITY: {
        id: 'liquidity',
        name: 'Liquidity',
        icon: 'liquidity',
        description: 'Weapon area +10%',
        effect: { areaMult: 0.1 }
    },
    HIGH_FREQUENCY: {
        id: 'high_frequency',
        name: 'High Frequency',
        icon: 'high_frequency',
        description: 'Attack speed +8%',
        effect: { cooldownMult: -0.08 }
    },
    WHALE_GRAVITY: {
        id: 'whale_gravity',
        name: 'Whale Gravity',
        icon: 'whale_gravity',
        description: 'Pickup range +30%',
        effect: { magnetMult: 0.3 }
    },
    COMPOUNDING: {
        id: 'compounding',
        name: 'Compounding',
        icon: 'compounding',
        description: 'XP gain +10%',
        effect: { expMult: 0.1 }
    },
    ALPHA: {
        id: 'alpha',
        name: 'Alpha',
        icon: 'alpha',
        description: 'Crit chance +5%',
        effect: { critChance: 0.05 }
    },
    SLIPPAGE: {
        id: 'slippage',
        name: 'Slippage',
        icon: 'slippage',
        description: '5% of hits slip right past you.',
        effect: { dodgeChance: 0.05 }
    },
    HEDGE: {
        id: 'hedge',
        name: 'Hedge',
        icon: 'hedge',
        description: 'Incoming damage -8%',
        effect: { damageReduction: 0.08 }
    },
    LEVERAGE: {
        id: 'leverage',
        name: 'Leverage',
        icon: 'leverage',
        description: 'Damage +25%, but you take +15% damage. High risk, high reward.',
        effect: { damageMult: 0.25, damageTakenMult: 0.15 }
    }
};

// ---------------------------------------------------------------------------
// Enemies: the bear market. Archetype flags: ranged, dasher, splitter, shielded, bomber, cloner.
// `score` defaults to `exp`.
// ---------------------------------------------------------------------------
export const ENEMIES = {
    RED_CANDLE: {
        id: 'red_candle',
        name: 'Red Candle',
        sprite: 'red_candle',
        hp: 15,
        speed: 110,
        damage: 10,
        exp: 10,
        size: 12
    },
    BAG_HOLDER: {
        id: 'bag_holder',
        name: 'Bag Holder',
        sprite: 'bag_holder',
        hp: 30,
        speed: 70,
        damage: 15,
        exp: 15,
        size: 18
    },
    PAPER_HANDS: {
        id: 'paper_hands',
        name: 'Paper Hands',
        sprite: 'paper_hands',
        hp: 25,
        speed: 95,
        damage: 12,
        exp: 12,
        size: 14
    },
    RUG_PULLER: {
        id: 'rug_puller',
        name: 'Rug Puller',
        sprite: 'rug_puller',
        dasher: true,
        dashSpeed: 320,
        dashInterval: 3.5,
        dashDuration: 0.6,
        hp: 40,
        speed: 150,
        damage: 20,
        exp: 20,
        size: 16
    },
    GRIZZLY: {
        id: 'grizzly',
        name: 'Grizzly',
        sprite: 'grizzly',
        shielded: true,
        shieldHp: 60,
        damageReduction: 0.5,
        hp: 120,
        speed: 45,
        damage: 30,
        exp: 50,
        size: 28
    },
    FUD_CLOUD: {
        id: 'fud_cloud',
        name: 'FUD Cloud',
        sprite: 'fud_cloud',
        hp: 20,
        speed: 130,
        damage: 18,
        exp: 18,
        size: 15
    },
    DOOMPOSTER: {
        id: 'doomposter',
        name: 'Doomposter',
        sprite: 'doomposter',
        ranged: true,
        firingRange: 360,
        keepDistance: 260,
        projectileSpeed: 220,
        projectileDamage: 14,
        fireCooldown: 2.4,
        hp: 28,
        speed: 70,
        damage: 8,
        exp: 22,
        size: 14
    },
    PONZI: {
        id: 'ponzi',
        name: 'Ponzi',
        sprite: 'ponzi',
        splitter: true,
        splitInto: 'downline',
        splitCount: 2,
        hp: 55,
        speed: 65,
        damage: 14,
        exp: 24,
        size: 20
    },
    DOWNLINE: {
        id: 'downline',
        name: 'Downline',
        sprite: 'downline',
        hp: 18,
        speed: 105,
        damage: 8,
        exp: 6,
        size: 10
    },
    MARGIN_CALL: {
        id: 'margin_call',
        name: 'Margin Call',
        sprite: 'margin_call',
        bomber: true,
        fuseRange: 80,
        fuseTime: 1.4,
        blastRadius: 120,
        blastDamage: 40,
        hp: 35,
        speed: 120,
        damage: 10,
        exp: 28,
        size: 14
    },
    SYBIL: {
        id: 'sybil',
        name: 'Sybil',
        sprite: 'sybil',
        cloner: true,
        cloneCooldown: 5.5,
        cloneCount: 2,
        hp: 42,
        speed: 95,
        damage: 12,
        exp: 30,
        size: 15
    }
};

// ---------------------------------------------------------------------------
// Bosses. `spawnAt` in seconds. `final: true` ends the run as a win when defeated.
// ---------------------------------------------------------------------------
export const BOSSES = {
    RUG_LORD: {
        id: 'rug_lord',
        name: 'Rug Lord',
        sprite: 'rug_lord',
        tagline: 'He is pulling everything.',
        hp: 2500,
        speed: 80,
        damage: 40,
        exp: 500,
        size: 44,
        boss: true,
        ability: 'summon',
        summon: 'rug_puller',
        summonCount: 3,
        abilityCooldown: 6,
        spawnAt: 300
    },
    CAPITULATION: {
        id: 'capitulation',
        name: 'Capitulation',
        sprite: 'capitulation',
        tagline: 'The biggest red candle you have ever seen.',
        hp: 4200,
        speed: 70,
        damage: 50,
        exp: 850,
        size: 46,
        boss: true,
        ability: 'summon',
        summon: 'red_candle',
        summonCount: 5,
        abilityCooldown: 6,
        spawnAt: 450
    },
    LIQUIDATION: {
        id: 'liquidation',
        name: 'Liquidation',
        sprite: 'liquidation',
        tagline: 'Your position is being closed.',
        hp: 6000,
        speed: 60,
        damage: 60,
        exp: 1200,
        size: 56,
        boss: true,
        ability: 'charge',
        chargeDistance: 120,
        abilityCooldown: 4.5,
        spawnAt: 600
    },
    BEAR_MARKET: {
        id: 'bear_market',
        name: 'The Bear Market',
        sprite: 'bear_market',
        tagline: 'Survive this and the cycle turns.',
        hp: 10000,
        speed: 55,
        damage: 75,
        exp: 2000,
        size: 64,
        boss: true,
        final: true,
        ability: 'charge',
        chargeDistance: 140,
        abilityCooldown: 4.5,
        spawnAt: 720
    },
    LONG_WINTER: {
        id: 'long_winter',
        name: 'The Long Winter',
        sprite: 'long_winter',
        tagline: 'Crypto winter has a face.',
        hp: 6200,
        speed: 55,
        damage: 60,
        exp: 1300,
        size: 58,
        boss: true,
        ability: 'charge',
        chargeDistance: 120,
        abilityCooldown: 4.5,
        spawnAt: 600,
        stageOnly: true
    }
};

// ---------------------------------------------------------------------------
// Wave director: [from, to) windows in seconds. The last window repeats forever.
// ---------------------------------------------------------------------------
export const WAVES = [
    { from: 0, to: 30, pool: ['red_candle', 'bag_holder'], spawnMult: 1.0, label: 'Opening Bell' },
    {
        from: 30,
        to: 60,
        pool: ['red_candle', 'bag_holder', 'paper_hands'],
        spawnMult: 1.1,
        label: 'First Dip'
    },
    {
        from: 60,
        to: 90,
        pool: ['bag_holder', 'paper_hands', 'doomposter'],
        spawnMult: 1.15,
        label: 'FUD Wave'
    },
    {
        from: 90,
        to: 120,
        pool: ['paper_hands', 'rug_puller', 'fud_cloud', 'doomposter'],
        spawnMult: 1.2,
        label: 'Rug Season'
    },
    {
        from: 120,
        to: 180,
        pool: ['rug_puller', 'fud_cloud', 'ponzi', 'doomposter', 'margin_call'],
        spawnMult: 1.3,
        label: 'Ponzi Unwinds'
    },
    {
        from: 180,
        to: 240,
        pool: ['rug_puller', 'grizzly', 'fud_cloud', 'ponzi', 'margin_call'],
        spawnMult: 1.4,
        label: 'Grizzly Country'
    },
    {
        from: 240,
        to: 300,
        pool: ['grizzly', 'fud_cloud', 'ponzi', 'doomposter', 'sybil'],
        spawnMult: 1.5,
        label: 'Pressure'
    },
    {
        from: 300,
        to: 420,
        pool: ['rug_puller', 'grizzly', 'fud_cloud', 'ponzi', 'doomposter', 'margin_call', 'sybil'],
        spawnMult: 1.6,
        label: 'Contagion'
    },
    {
        from: 420,
        to: 600,
        pool: ['grizzly', 'ponzi', 'doomposter', 'fud_cloud', 'rug_puller', 'sybil'],
        spawnMult: 1.75,
        label: 'Capitulation'
    },
    {
        from: 600,
        to: Infinity,
        pool: [
            'grizzly',
            'ponzi',
            'doomposter',
            'fud_cloud',
            'rug_puller',
            'paper_hands',
            'margin_call',
            'sybil'
        ],
        spawnMult: 2.0,
        label: 'Max Pain'
    }
];

// ---------------------------------------------------------------------------
// Stages: modifier sets over the waves and bosses. The Daily Challenge picks one from its seed.
// ---------------------------------------------------------------------------
export const STAGES = {
    CHOP: {
        id: 'chop',
        name: 'Chop Zone',
        description: 'Sideways and brutal. The default market.',
        palette: { bg: '#07090C', grid: '#131A22', gridMajor: '#1B222B', terrain: '#0F151C' },
        poolWeights: {},
        extraEnemies: [],
        bossOffsets: {},
        bossOverrides: {},
        modifiers: {}
    },
    BEAR_TRAP: {
        id: 'bear_trap',
        name: 'Bear Trap',
        description: 'More doomposters and sybils. The Rug Lord shows up at 4:00.',
        palette: { bg: '#0A0708', grid: '#1A1115', gridMajor: '#26171D', terrain: '#140C10' },
        poolWeights: {
            doomposter: 1.8,
            sybil: 1.6,
            fud_cloud: 1.4,
            paper_hands: 1.2,
            red_candle: 0.6,
            bag_holder: 0.5,
            rug_puller: 0.7
        },
        extraEnemies: ['doomposter'],
        bossOffsets: { rug_lord: -60, capitulation: -30 },
        bossOverrides: {},
        modifiers: {}
    },
    WINTER: {
        id: 'winter',
        name: 'Crypto Winter',
        description:
            'Frozen order books (-10% speed), thicker bears (+20% HP), and the cold drains 1 HP every 10s.',
        palette: { bg: '#060A10', grid: '#111B26', gridMajor: '#182635', terrain: '#0C1520' },
        poolWeights: {
            rug_puller: 1.5,
            grizzly: 1.4,
            bag_holder: 1.1,
            paper_hands: 1.1,
            red_candle: 0.5,
            doomposter: 0.7
        },
        extraEnemies: [],
        bossOffsets: {},
        bossOverrides: { liquidation: 'long_winter' },
        modifiers: {
            playerSpeedMult: 0.9,
            enemyHpMult: 1.2,
            coldTickInterval: 10,
            coldTickDamage: 1
        }
    }
};

export const STAGE_ROTATION = ['chop', 'bear_trap', 'winter'];
export const DEFAULT_STAGE = 'chop';

// ---------------------------------------------------------------- daily twists

/**
 * One rule change per Daily Challenge, the same for everyone that day (a pure function of the seed, like the
 * stage). Free runs have no twist. The twist is also written into the run log, so a replay needs nothing else.
 * TWIST_IDS is append-only: a twist's index is its byte in the log.
 */
export const TWIST_IDS = [
    'none',
    'high_volatility',
    'leverage_day',
    'whale_season',
    'flash_crash',
    'bull_run',
    'thin_liquidity'
];

const TWIST_DEFAULTS = {
    playerSpeedMult: 1,
    playerDamageMult: 1,
    enemyHpMult: 1,
    enemyDmgMult: 1,
    spawnMult: 1,
    xpMult: 1
};

export const TWISTS = {
    none: { id: 'none', name: 'No twist', description: 'The plain bear market.' },
    high_volatility: {
        id: 'high_volatility',
        name: 'High Volatility',
        description: '+30% bears, +30% XP.',
        spawnMult: 1.3,
        xpMult: 1.3
    },
    leverage_day: {
        id: 'leverage_day',
        name: 'Leverage Day',
        description: 'You hit 50% harder. So do they.',
        playerDamageMult: 1.5,
        enemyDmgMult: 1.5
    },
    whale_season: {
        id: 'whale_season',
        name: 'Whale Season',
        description: 'Bears have +60% HP and drop +60% XP.',
        enemyHpMult: 1.6,
        xpMult: 1.6
    },
    flash_crash: {
        id: 'flash_crash',
        name: 'Flash Crash',
        description: 'Twice the bears, half the HP.',
        spawnMult: 2,
        enemyHpMult: 0.5
    },
    bull_run: {
        id: 'bull_run',
        name: 'Bull Run',
        description: 'You run 25% faster. So does the spawn rate.',
        playerSpeedMult: 1.25,
        spawnMult: 1.25
    },
    thin_liquidity: {
        id: 'thin_liquidity',
        name: 'Thin Liquidity',
        description: '-30% XP, but you hit 30% harder.',
        xpMult: 0.7,
        playerDamageMult: 1.3
    }
};

/** Twist definition with every multiplier filled in. Unknown ids are "none". */
export function twistDef(id) {
    return { ...TWIST_DEFAULTS, ...(TWISTS[id] || TWISTS.none) };
}

/** The Daily Challenge twist: uses different bits of the seed than the stage, so pairings vary. */
export function dailyTwistForSeed(seed) {
    const rotation = TWIST_IDS.slice(1);
    return rotation[Math.floor((seed >>> 0) / STAGE_ROTATION.length) % rotation.length];
}

// ---------------------------------------------------------------- characters

/**
 * Playable characters. The chosen one is written into the run log (like the twist), so a replay needs nothing
 * else and the server re-simulates every run with the right character. CHARACTER_IDS is append-only: a
 * character's index is its byte in the log. The bull is index 0 and the default; unknown ids are the bull.
 * `starterWeapon` is the weapon a run starts with; `maxHp` and `speedMult` default to SIM.PLAYER_HP and 1. Add
 * more fields here as characters need them, and read them in the Simulation, never in the UI (`sprite` and
 * `tagline` are display only).
 */
export const CHARACTER_IDS = ['bull', 'pepe'];

export const CHARACTERS = {
    bull: {
        id: 'bull',
        name: 'The Bull',
        sprite: 'bull',
        tagline: 'You are a bull. The bear market is endless.',
        emoji: '🐂',
        description: 'Horns · 100 HP',
        starterWeapon: STARTER_WEAPON
    },
    pepe: {
        id: 'pepe',
        name: 'Pepe',
        sprite: 'pepe',
        tagline: 'You are a frog. The bear market is endless. Comfy.',
        emoji: '🐸',
        description: 'Tongue · 90 HP · fast',
        starterWeapon: 'tongue',
        maxHp: 90,
        speedMult: 1.1
    }
};

/** Character definition. Unknown ids are the bull. */
export function characterDef(id) {
    return CHARACTERS[id] || CHARACTERS.bull;
}

const MOD_DEFAULTS = { playerSpeedMult: 1, enemyHpMult: 1, coldTickInterval: 0, coldTickDamage: 0 };

export function getStage(id) {
    return Object.values(STAGES).find((s) => s.id === id) || STAGES.CHOP;
}

/** The Daily Challenge stage is a pure function of the seed, so the verifier needs nothing else. */
export function stageForSeed(seed) {
    return STAGE_ROTATION[(seed >>> 0) % STAGE_ROTATION.length];
}

export function stageModifiers(id) {
    return { ...MOD_DEFAULTS, ...getStage(id).modifiers };
}

export function wavesFor(id) {
    const extra = getStage(id).extraEnemies;
    return WAVES.map((w) => ({
        ...w,
        pool: extra.length ? [...new Set(w.pool.concat(extra))] : w.pool.slice()
    }));
}

/** Boss schedule for a stage: offsets applied (never before 30s), overrides swapped in, stage-only bosses skipped. */
export function bossesFor(id) {
    const stage = getStage(id);
    const byId = Object.fromEntries(Object.values(BOSSES).map((b) => [b.id, b]));
    const out = [];
    for (const b of Object.values(BOSSES)) {
        if (b.stageOnly) continue;
        const def = byId[stage.bossOverrides[b.id]] || b;
        out.push({
            ...def,
            spawnAt: Math.max(30, b.spawnAt + (stage.bossOffsets[b.id] || 0)),
            slot: b.id
        });
    }
    return out.sort((a, b) => a.spawnAt - b.spawnAt);
}

export function pickWeighted(pool, stageId, rnd) {
    const weights = getStage(stageId).poolWeights;
    let total = 0;
    const cum = pool.map((id) => (total += Math.max(0, weights[id] ?? 1)));
    const r = rnd() * total;
    for (let i = 0; i < pool.length; i++) if (r < cum[i]) return pool[i];
    return pool[pool.length - 1];
}

const ENEMY_BY_ID = Object.fromEntries(Object.values(ENEMIES).map((e) => [e.id, e]));
const WEAPON_BY_ID = Object.fromEntries(Object.values(WEAPONS).map((w) => [w.id, w]));

export function enemyDef(id) {
    return ENEMY_BY_ID[id] || null;
}

export function weaponDef(id) {
    return WEAPON_BY_ID[id] || null;
}
