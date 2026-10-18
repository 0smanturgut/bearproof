/**
 * @module sim/sim
 * @description The deterministic BEARPROOF simulation. No DOM, no audio, no clocks, no Math.random.
 *
 *   const sim = new Simulation({ seed, twist, character });   // twist: the Daily Challenge's TWISTS id, else none;
 *                                                             // character: a CHARACTERS id, default the bull
 *   while (!sim.over) {
 *       if (sim.choices) sim.choose(pickIndex);   // level-up: the sim waits until a card is picked
 *       else sim.step(moveCode);                  // one fixed 1/60 s tick
 *       for (const ev of sim.drainEvents()) ...   // hits, kills, sounds, bosses → renderer
 *   }
 *
 * The same seed + the same sequence of move codes and picks always produces the same run, bit for bit,
 * on every JS engine. That is what lets the server re-simulate a submitted run to verify its score.
 * Ported from the upstream Game class (day-0 src/main.js); the orchestration is unchanged in spirit.
 */

import {
    CHOICE_REROLL,
    CHOICE_SKIP,
    CRATE_LOOT,
    CRATE_LOOT_IDS,
    GOLD_SHARE,
    PASSIVES,
    PICKUPS,
    PIGGY_LOOT,
    SIM,
    STARTER_WEAPON,
    WEAPONS,
    bossesFor,
    enemyDef,
    pickWeighted,
    stageForSeed,
    stageModifiers,
    twistDef,
    wavesFor,
    weaponDef,
    characterDef
} from './content.js';
import { cos, hypot, sin } from './dmath.js';
import {
    Breakable,
    Enemy,
    Pickup,
    Player,
    SupplyCrate,
    Whale,
    XpOrb,
    resetEntityIds
} from './entities.js';
import { MOVE_TABLE, isValidCode } from './input-codes.js';
import { Rng } from './rng.js';
import { SpatialHash } from './spatial.js';
import { Terrain } from './terrain.js';
import { Weapon } from './weapons.js';

/** Bump when a change alters simulation results for the same inputs. 2: daily twists. 3: closer spawns and the
 * opening-bell ring. 4: airdrop crates. 5: Rug Lord's second phase (the rug pull). 6: doomposters type before
 * they shoot, from closer. 7: Whale Alert (a whale crosses at 1:30, shoving bears and dropping candles).
 * 8: Boss Jackpot (a boss kill pays triple score and rains its XP as a ring of falling gold candles).
 * 9: Copium (Hopium evolves at Lv 5 and slows bears in the cloud). 10: God Candle (a fourth crate loot that
 * wipes every bear near the bull). 11: Pump and Dump (a bear from 2:30 that swells and pops into red candles).
 * 12: Liquidation Warning (charge bosses crouch 1 s over a marked landing spot, and never jump past the bull).
 * 13: Exit Scam (from 3:00 a scammer pockets loose candles and runs; kill it and the bag spills out).
 * 14: Bear Spray (a new weapon in the level-up pool: a cone that shoves bears and breaks shields).
 * 15: Buy the Dip (under 30% HP, kills heal for 5 s, once a minute). 16: Liquidation Risk (Leverage evolves at 5
 * stacks: +10% crit, crits chain to 2 more bears, 2x damage taken). 17: Withdrawal Freeze (Crypto Winter's
 * mini-boss at 3:30 freezes candles near it; its death thaws them to the bull and slows the bears around him).
 * 18: Options Expiry (a Daily twist: XP candles expire after 6 s and are worth +50%). 19: Moon Rocket (a fifth
 * crate loot: 4 s of 1.8x speed, untouchable, ramming bears), and Bear Trap's extra doomposters join at 1:00.
 * 20: Honey Trap (a new weapon in the level-up pool: honey puddles slow bears, grizzlies stop to eat).
 * 21: The Whale (a third character: Buy Wall, a bigger body, and Sweep the Book once a minute).
 * 22: The map is solid (sim/terrain.js: trees, walls, wrecks stop the bull and the bears; bosses and FUD clouds go
 * over), piggy banks to smash for pickups (ramen, a gold candle, CLOUT, Liquidity Sweep, Trading Halt, Short
 * Squeeze), a treasure chest from every boss (free level-ups), and two rerolls and two skips of level-up cards. */
export const SIM_VERSION = 22;

export class Simulation {
    constructor({ seed = 1, stage = null, twist = null, character = null } = {}) {
        resetEntityIds();
        this.seed = seed >>> 0;
        this.stageId = stage || stageForSeed(this.seed);
        this.twist = twistDef(twist);
        this.twistId = this.twist.id;
        this.character = characterDef(character);
        this.characterId = this.character.id;
        this.rng = new Rng(this.seed);
        this.terrain = new Terrain(this.stageId, this.seed);
        this.stageMods = stageModifiers(this.stageId);
        this.waves = wavesFor(this.stageId);
        this.bossPlan = bossesFor(this.stageId);
        this.bossWarned = new Set();
        this.bossSpawned = new Set();

        this.tick = 0;
        this.time = 0;
        this.player = new Player(0, 0);
        if (this.character.maxHp) {
            this.player.baseMaxHp = this.player.maxHp = this.player.hp = this.character.maxHp;
        }
        this.player.characterSpeedMult = this.character.speedMult || 1;
        if (this.character.size) this.player.size = this.character.size;
        this.player.twistDamageMult = this.twist.playerDamageMult;
        this.player.twistExpMult = this.twist.xpMult;
        this.player.weapons.push(
            new Weapon(weaponDef(this.character.starterWeapon || STARTER_WEAPON))
        );
        this.enemies = [];
        this.projectiles = [];
        this.enemyProjectiles = [];
        this.mines = [];
        this.honey = []; // Honey Trap: jars in flight and puddles on the floor
        this.walls = []; // Buy Wall: rings rolling out from the Whale
        this.xp = [];
        this.crates = [];
        this.pickups = []; // what piggy banks and bosses dropped (PICKUPS)
        this.breakables = []; // the piggy banks near the bull (sim/terrain.js places them)
        this.broken = new Set(); // keys of the ones smashed this run
        this.haltUntil = 0; // Trading Halt: bears stand frozen while time < haltUntil
        this.rerolls = SIM.REROLLS;
        this.skips = SIM.SKIPS;
        this.nextCrateAt = SIM.CRATE_FIRST;
        this.lastLoot = null;
        this.whale = null;
        this.whalePlan = null; // { dir, lane, spawned } once the alert has gone out
        this.nextScamAt = SIM.SCAM_FIRST;
        this.dipUntil = 0; // Buy the Dip: kills heal while time < dipUntil
        this.dipReadyAt = 0; // and it can't fire again before this
        this.delayed = [];
        this.spatial = new SpatialHash(64);

        this.spawnAcc = 0;
        this.calmUntil = 0; // no spawns before this time (a God Candle's calm)
        this.coldAcc = 0;
        this.enemyDmgMult = 1;
        this.hpMult = 1;
        this.wave = this.waves[0];
        this.pendingLevelUps = 0;
        this.choices = null;
        this.picks = 0;
        this.over = false;
        this.won = false;
        this.endReason = null;
        this.stats = {
            kills: 0,
            score: 0,
            bossKills: 0,
            damageTaken: 0,
            damageDealt: 0,
            bossDamage: 0, // the part of damageDealt that hit bosses (a counter: the profile's Eternal Bear reads it)
            crates: 0,
            scamsBusted: 0, // Exit Scam: scammers killed with something in the bag
            scamsEscaped: 0,
            shieldsBroken: 0, // Bear Spray
            dips: 0, // Buy the Dip: windows opened
            dipHealed: 0, // and the HP they gave back
            liquidations: 0, // Liquidation Risk: chain hits
            candlesFrozen: 0, // Withdrawal Freeze: candles it iced
            candlesThawed: 0, // and the ones its death sent to the bull
            rammed: 0, // Moon Rocket: bears rammed
            honeyEaten: 0, // Honey Trap: grizzlies that sat down to eat (once per puddle)
            wallHits: 0, // Buy Wall: bears a wall hit
            sweeps: 0, // Sweep the Book: sweeps that pulled at least one candle
            swept: 0, // and the candles they pulled
            smashed: 0, // piggy banks smashed
            pickups: 0, // pickups taken (chests not counted)
            chests: 0, // boss treasure chests opened
            clout: 0, // CLOUT picked up (the profile banks it with the run)
            rerolls: 0,
            skips: 0
        };
        this.rocketHit = new Set(); // bears rammed on the current ride
        this.events = [];
    }

    emit(ev) {
        this.events.push(ev);
    }

    drainEvents() {
        const e = this.events;
        this.events = [];
        return e;
    }

    schedule(seconds, fn) {
        this.delayed.push({ t: seconds, fn });
    }

    // --- Tick -------------------------------------------------------------

    /** Advance one tick with a move code (see input-codes.js). Returns false if the sim can't advance. */
    step(code = 0) {
        if (this.over || this.choices) return false;
        const [mx, my] = MOVE_TABLE[isValidCode(code) ? code : 0];
        const dt = SIM.DT;
        this.tick++;
        this.time = this.tick * dt;

        const timeDiff = 1 + Math.floor(this.time / 60) * 0.3;
        this.hpMult = timeDiff * (this.stageMods.enemyHpMult || 1) * this.twist.enemyHpMult;
        this.enemyDmgMult = timeDiff * this.twist.enemyDmgMult;
        this._selectWave();

        if (this.tick % SIM.BREAK_EVERY === 1) this._activateBreakables();
        this.spatial.rebuild(this.enemies);
        for (const b of this.breakables) this.spatial.insert(b);
        const p = this.player;
        p.update(dt, this, mx, my);
        if (p.dead) return this._end('liquidated');
        if (p.rocketTimer > 0) this._rocketRam();
        this._smashByContact();

        this._coldTick(dt);
        this._updateEnemies(dt);
        if (p.dead) return this._end('liquidated');
        if (p.rocketTimer <= 0) this.collidePlayer(); // a rug pull can drag the bull into a wall
        this._updateProjectiles(dt);
        this._updateList(this.enemyProjectiles, dt);
        this._updateList(this.mines, dt);
        this._updateList(this.honey, dt);
        this._updateList(this.walls, dt);
        this._runDelayed(dt);
        this._cullDead();
        this._sweep();
        this._updateList(this.xp, dt);
        this._updateList(this.crates, dt);
        this._updateList(this.pickups, dt);
        this._dropCrate();
        this._whaleTick(dt);
        this._spawn(dt);
        this._exitScam();
        if (p.dead) return this._end('liquidated');
        this._buyTheDip();

        if (this.tick % SIM.TICK_RATE === 0) this.stats.score += SIM.SCORE_PER_SECOND;
        if (this.won) return this._end('won');
        if (this.tick >= SIM.MAX_TICKS) return this._end('market_closed');
        if (this.pendingLevelUps > 0) this._rollChoices();
        return true;
    }

    _end(reason) {
        this.over = true;
        this.endReason = reason;
        if (reason === 'won') this.stats.score += SIM.WIN_BONUS;
        this.emit({ t: 'over', reason, won: reason === 'won' });
        return false;
    }

    _selectWave() {
        const t = this.time;
        let w = this.waves[this.waves.length - 1];
        for (const cand of this.waves) {
            if (t >= cand.from && t < cand.to) {
                w = cand;
                break;
            }
        }
        if (w !== this.wave) {
            // a window can split a wave (a new bear joins mid-wave); only a new label is a new wave
            if (w.label !== this.wave.label) this.emit({ t: 'wave', label: w.label });
            this.wave = w;
        }
    }

    _coldTick(dt) {
        const m = this.stageMods;
        if (!m.coldTickInterval) return;
        this.coldAcc += dt;
        while (this.coldAcc >= m.coldTickInterval) {
            this.coldAcc -= m.coldTickInterval;
            const next = Math.max(1, this.player.hp - (m.coldTickDamage || 1));
            if (next < this.player.hp) {
                this.emit({
                    t: 'cold',
                    x: this.player.x,
                    y: this.player.y,
                    v: this.player.hp - next
                });
                this.player.hp = next;
            }
        }
    }

    _updateEnemies(dt) {
        const p = this.player;
        for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (e.hp <= 0) continue;
            e.update(dt, this);
            if (e.hp <= 0) continue;
            const d = hypot(e.x - p.x, e.y - p.y);
            const frozen = !e.boss && this.time < this.haltUntil;
            if (d < e.size + p.size && !p.invincible && !frozen) p.takeDamage(e.damage, this);
            if (d > SIM.DESPAWN_RADIUS && !e.boss) e.despawned = true;
        }
    }

    _updateProjectiles(dt) {
        for (const pr of this.projectiles) {
            pr.update(dt, this);
            if (pr.dead) continue;
            for (const e of this.spatial.queryRect(pr.x, pr.y, pr.size + 32)) {
                if (e.hp <= 0 || pr.hit.has(e)) continue;
                if (hypot(pr.x - e.x, pr.y - e.y) < e.size + pr.size) {
                    const chance = pr.critChance || 0;
                    const crit = chance > 0 && this.rng.next() < chance;
                    this.damageEnemy(e, crit ? pr.damage * 2 : pr.damage, crit, pr.id);
                    pr.hit.add(e);
                    if (!pr.piercing) {
                        pr.dead = true;
                        break;
                    }
                }
            }
        }
        this.projectiles = this.projectiles.filter((pr) => !pr.dead);
    }

    _updateList(list, dt) {
        for (const it of list) if (!it.dead) it.update(dt, this);
        let w = 0;
        for (let i = 0; i < list.length; i++) if (!list[i].dead) list[w++] = list[i];
        list.length = w;
    }

    _runDelayed(dt) {
        if (!this.delayed.length) return;
        const due = [];
        const keep = [];
        for (const d of this.delayed) {
            d.t -= dt;
            (d.t <= 0 ? due : keep).push(d);
        }
        this.delayed = keep;
        for (const d of due) d.fn();
    }

    /** Resolve deaths (kills → XP, score, splits) and remove despawned enemies. */
    _cullDead() {
        const alive = [];
        const born = [];
        for (const e of this.enemies) {
            if (e.hp <= 0) this._onKilled(e, born);
            else if (!e.despawned) alive.push(e);
        }
        this.enemies = born.length ? alive.concat(born) : alive;
    }

    /** Boss Jackpot: the boss's XP falls as a ring of gold candles around the body, one after another. */
    _rainJackpot(e) {
        const n = SIM.JACKPOT_CANDLES;
        for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2;
            const r = k % 2 ? SIM.JACKPOT_RING_MAX : SIM.JACKPOT_RING_MIN;
            const fall = SIM.JACKPOT_FALL * (k + 1);
            this.xp.push(new XpOrb(e.x + cos(a) * r, e.y + sin(a) * r, e.exp / n, fall));
        }
    }

    _onKilled(e, born) {
        let jackpot = 0;
        if (!e.selfDestructed) {
            this.stats.kills++;
            if (e.boss) {
                jackpot = e.exp * SIM.BOSS_SCORE_MULT * SIM.BOSS_JACKPOT_MULT;
                this.stats.score += jackpot;
                this._rainJackpot(e);
            } else {
                this.stats.score += e.exp;
                this.xp.push(new XpOrb(e.x, e.y, e.exp));
            }
            if (this.time < this.dipUntil) this._dipHeal(e);
        }
        this.emit({ t: 'kill', x: e.x, y: e.y, id: e.id, boss: e.boss, self: !!e.selfDestructed });
        if (e.boss) {
            this.stats.bossKills++;
            this.emit({ t: 'bossDown', id: e.id, name: e.def.name, x: e.x, y: e.y, jackpot });
            if (e.def.final) this.won = true;
            else if (!e.selfDestructed) {
                // the boss leaves its treasure where it fell (or the nearest free spot)
                const [cx, cy] = this.terrain.free(e.x, e.y, 22);
                this.pickups.push(new Pickup(cx, cy, 'chest', SIM.CHEST_LIFE));
                this.emit({ t: 'chestDrop', x: cx, y: cy });
            }
        }
        if (e.def.splitter && e.def.splitInto) {
            const child = enemyDef(e.def.splitInto);
            const n = e.def.splitCount || 2;
            for (let k = 0; k < n; k++) {
                const a = (k / n) * Math.PI * 2;
                born.push(
                    new Enemy(
                        e.x + cos(a) * 14,
                        e.y + sin(a) * 14,
                        child,
                        this.hpMult,
                        this.enemyDmgMult,
                        this
                    )
                );
            }
        }
        if (e.def.pumper) this._dump(e, born);
        if (e.def.thief && e.bagCount > 0) this._spillBag(e);
        if (e.def.freezeRadius) this._thaw(e);
    }

    /** Withdrawal Freeze: every landed candle within `freezeRadius` of the boss freezes in place. */
    freezeCandles(boss) {
        const r = boss.def.freezeRadius;
        for (const o of this.xp) {
            if (o.dead || o.frozen || o.fall > 0) continue;
            const dx = o.x - boss.x;
            const dy = o.y - boss.y;
            if (dx * dx + dy * dy > r * r) continue;
            o.frozen = true;
            o.vacuum = false;
            o.speed = 0;
            this.stats.candlesFrozen++;
            this.emit({ t: 'candleFreeze', x: o.x, y: o.y });
        }
    }

    /** Withdrawals reopen: every frozen candle flies to the bull, and the bears around him are slowed. */
    _thaw(boss) {
        const def = boss.def;
        const p = this.player;
        let n = 0;
        for (const o of this.xp) {
            if (!o.frozen) continue;
            o.frozen = false;
            o.vacuum = true;
            n++;
        }
        this.stats.candlesThawed += n;
        let slowed = 0;
        const r2 = def.thawRadius * def.thawRadius;
        for (const e of this.enemies) {
            if (e.boss || e.hp <= 0 || e.despawned) continue;
            if ((e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y) > r2) continue;
            e.slowTimer = Math.max(e.slowTimer, def.thawTime);
            e.slowPct = Math.max(e.slowPct || 0, def.thawSlow);
            slowed++;
        }
        this.emit({
            t: 'thaw',
            x: boss.x,
            y: boss.y,
            px: p.x,
            py: p.y,
            r: def.thawRadius,
            n,
            slowed
        });
    }

    /** Buy the Dip: under DIP_AT of max HP, open a DIP_TIME s window where kills heal (once per DIP_COOLDOWN s). */
    _buyTheDip() {
        const p = this.player;
        if (this.time < this.dipReadyAt || p.hp >= p.maxHp * SIM.DIP_AT) return;
        this.dipUntil = this.time + SIM.DIP_TIME;
        this.dipReadyAt = this.time + SIM.DIP_COOLDOWN;
        this.stats.dips++;
        this.emit({ t: 'dip', x: p.x, y: p.y, in: SIM.DIP_TIME });
    }

    /** A kill inside the Buy the Dip window heals the bull. `v` is what it actually gave back (0 at full HP). */
    _dipHeal(e) {
        const p = this.player;
        const before = p.hp;
        p.heal(SIM.DIP_HEAL);
        const v = p.hp - before;
        this.stats.dipHealed += v;
        this.emit({ t: 'dipHeal', x: e.x, y: e.y, px: p.x, py: p.y, v });
    }

    /** Exit Scam busted: the whole bag spills out as a ring of candles around the body. */
    _spillBag(e) {
        const n = e.bagCount;
        const r = e.size + 14;
        for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2;
            this.xp.push(new XpOrb(e.x + cos(a) * r, e.y + sin(a) * r, e.bag / n));
        }
        this.stats.scamsBusted++;
        this.emit({ t: 'scamBust', x: e.x, y: e.y, n, v: e.bag, r });
    }

    /** Exit Scam got away (called by the scammer as it leaves): the XP in its bag is gone. */
    scamEscaped(e) {
        this.stats.scamsEscaped++;
        this.emit({ t: 'scamGone', x: e.x, y: e.y, n: e.bagCount, v: e.bag });
    }

    /** From SCAM_FIRST, one scammer every SCAM_EVERY s, just off screen like any bear. */
    _exitScam() {
        if (this.time < this.nextScamAt) return;
        this.nextScamAt += SIM.SCAM_EVERY;
        const a = this.rng.angle();
        const e = new Enemy(
            this.player.x + cos(a) * SIM.SPAWN_RADIUS,
            this.player.y + sin(a) * SIM.SPAWN_RADIUS,
            enemyDef('exit_scam'),
            this.hpMult,
            this.enemyDmgMult,
            this
        );
        this.enemies.push(e);
        this.emit({ t: 'scam', x: e.x, y: e.y });
    }

    /** Pump and Dump pops: 2 red candles if popped early, up to 6 at the top, in a ring around the body. */
    _dump(e, born) {
        const def = e.def;
        const n = def.dumpMin + Math.floor((def.dumpMax - def.dumpMin) * e.pump + 1e-9);
        const child = enemyDef(def.dumpInto);
        const r = e.size + 8;
        for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2;
            born.push(
                new Enemy(
                    e.x + cos(a) * r,
                    e.y + sin(a) * r,
                    child,
                    this.hpMult,
                    this.enemyDmgMult,
                    this
                )
            );
        }
        this.emit({ t: 'dump', x: e.x, y: e.y, n, r, self: !!e.selfDestructed });
    }

    _spawn(dt) {
        const wave = this.wave;
        if (this.tick === SIM.OPENING_TICK) {
            // Evenly spaced from a random start, so the first seconds always have bears walking in.
            const a0 = this.rng.angle();
            for (let i = 0; i < SIM.OPENING_RING; i++) {
                const a = a0 + (i * 2 * Math.PI) / SIM.OPENING_RING;
                const id = pickWeighted(wave.pool, this.stageId, () => this.rng.next());
                this.enemies.push(
                    new Enemy(
                        this.player.x + cos(a) * SIM.OPENING_RADIUS,
                        this.player.y + sin(a) * SIM.OPENING_RADIUS,
                        enemyDef(id),
                        this.hpMult,
                        this.enemyDmgMult,
                        this
                    )
                );
            }
        }
        const max = Math.min(SIM.MAX_ENEMIES, 20 + Math.floor(this.time / 10));
        const interval =
            Math.max(0.2, 1.2 - this.time / 200) / ((wave.spawnMult || 1) * this.twist.spawnMult);
        // a God Candle's calm: no regular spawns, and no backlog to burst in after it (bosses stay on schedule)
        this.spawnAcc = this.time < this.calmUntil ? 0 : this.spawnAcc + dt;
        while (this.spawnAcc >= interval && this.enemies.length < max) {
            this.spawnAcc -= interval;
            const id = pickWeighted(wave.pool, this.stageId, () => this.rng.next());
            const a = this.rng.angle();
            const dist = SIM.SPAWN_RADIUS + this.rng.next() * 120;
            this.enemies.push(
                new Enemy(
                    this.player.x + cos(a) * dist,
                    this.player.y + sin(a) * dist,
                    enemyDef(id),
                    this.hpMult,
                    this.enemyDmgMult,
                    this
                )
            );
        }
        if (this.spawnAcc > interval) this.spawnAcc = interval;

        for (const b of this.bossPlan) {
            if (this.time >= b.spawnAt - 5 && !this.bossWarned.has(b.slot)) {
                this.bossWarned.add(b.slot);
                this.emit({ t: 'bossWarn', id: b.id, name: b.name, tagline: b.tagline, in: 5 });
            }
            if (this.time >= b.spawnAt && !this.bossSpawned.has(b.slot)) {
                this.bossSpawned.add(b.slot);
                const a = this.rng.angle();
                const d = SIM.BOSS_SPAWN_RADIUS;
                const boss = new Enemy(
                    this.player.x + cos(a) * d,
                    this.player.y + sin(a) * d,
                    b,
                    this.hpMult,
                    this.enemyDmgMult,
                    this
                );
                this.enemies.push(boss);
                this.emit({ t: 'boss', id: b.id, name: b.name, tagline: b.tagline });
            }
        }
    }

    // --- Airdrop crates ------------------------------------------------------

    /** On schedule, drop a crate on screen near the bull. Its loot never repeats the previous crate's. */
    _dropCrate() {
        if (this.time < this.nextCrateAt) return;
        this.nextCrateAt += SIM.CRATE_EVERY;
        const a = this.rng.angle();
        const dist =
            SIM.CRATE_DIST_MIN + this.rng.next() * (SIM.CRATE_DIST_MAX - SIM.CRATE_DIST_MIN);
        const pool = CRATE_LOOT_IDS.filter((id) => id !== this.lastLoot);
        const loot = pool[this.rng.int(pool.length)];
        this.lastLoot = loot;
        const [cx, cy] = this.terrain.free(
            this.player.x + cos(a) * dist,
            this.player.y + sin(a) * dist,
            24
        );
        const crate = new SupplyCrate(cx, cy, loot);
        this.crates.push(crate);
        this.emit({ t: 'crateDrop', x: crate.x, y: crate.y });
    }

    // --- Sweep the Book (the Whale) ----------------------------------------------

    /** Seconds until the character's next sweep, or null if it has none. */
    get sweepIn() {
        const every = this.character.sweepEvery;
        if (!every) return null;
        const period = every * SIM.TICK_RATE;
        return (period - (this.tick % period)) / SIM.TICK_RATE;
    }

    /** Every `sweepEvery` s: each landed, unfrozen candle within `sweepRadius` flies to the player. */
    _sweep() {
        const c = this.character;
        if (!c.sweepEvery || this.tick % (c.sweepEvery * SIM.TICK_RATE) !== 0) return;
        const p = this.player;
        let n = 0;
        for (const o of this.xp) {
            if (o.dead || o.fall > 0 || o.frozen || o.vacuum) continue;
            if (hypot(o.x - p.x, o.y - p.y) > c.sweepRadius) continue;
            o.vacuum = true;
            n++;
        }
        if (n) this.stats.sweeps++;
        this.stats.swept += n;
        this.emit({ t: 'sweep', x: p.x, y: p.y, r: c.sweepRadius, n });
    }

    // --- Whale Alert ------------------------------------------------------------

    /** Once a run: the alert (which side, which lane) at WHALE_AT - WHALE_WARN, the whale at WHALE_AT. */
    _whaleTick(dt) {
        if (this.whale) {
            this.whale.update(dt, this);
            if (this.whale.dead) this.whale = null;
            return;
        }
        if (!this.whalePlan && this.time >= SIM.WHALE_AT - SIM.WHALE_WARN) {
            const dir = this.rng.next() < 0.5 ? 1 : -1;
            const side = this.rng.next() < 0.5 ? 1 : -1;
            const spread = SIM.WHALE_LANE_MAX - SIM.WHALE_LANE_MIN;
            const lane = side * (SIM.WHALE_LANE_MIN + this.rng.next() * spread);
            this.whalePlan = { dir, lane, spawned: false };
            this.emit({ t: 'whaleWarn', dir, lane, in: SIM.WHALE_WARN });
        }
        if (this.whalePlan && !this.whalePlan.spawned && this.time >= SIM.WHALE_AT) {
            const { dir, lane } = this.whalePlan;
            this.whalePlan.spawned = true;
            const x = this.player.x - dir * SIM.WHALE_START;
            this.whale = new Whale(x, this.player.y + lane, dir);
            this.emit({ t: 'whale', x, y: this.whale.y, dir });
        }
    }

    /** The bull reached a landed crate: apply its loot. */
    openCrate(crate) {
        const def = CRATE_LOOT[crate.loot];
        const p = this.player;
        if (def.id === 'magnet') {
            for (const o of this.xp) o.vacuum = true;
        } else if (def.id === 'shield') {
            p.shieldTimer = def.duration;
        } else if (def.id === 'printer') {
            p.printerTimer = def.duration;
            p.printerMult = def.cooldownMult;
        } else if (def.id === 'god_candle') {
            this._godCandle(def);
        } else if (def.id === 'moon_rocket') {
            p.rocketTimer = def.duration;
            p.rocketMult = def.speedMult;
            this.rocketHit.clear();
        }
        this.stats.crates++;
        this.emit({ t: 'crate', id: def.id, name: def.name, x: crate.x, y: crate.y });
    }

    /** Moon Rocket: every bear touching the bull (plus `ramReach`) is rammed once per ride: its shield breaks, it
     * takes `ramDamage` × the clock's HP scaling, and (not a boss) it's knocked straight away from the bull. */
    _rocketRam() {
        const def = CRATE_LOOT.moon_rocket;
        const p = this.player;
        const dmg = def.ramDamage * this.hpMult;
        for (const e of this.spatial.queryRect(p.x, p.y, p.size + def.ramReach + 40)) {
            if (e.hp <= 0 || e.breakable || this.rocketHit.has(e.uid)) continue;
            const dx = e.x - p.x;
            const dy = e.y - p.y;
            const d = hypot(dx, dy);
            if (d > e.size + p.size + def.ramReach) continue;
            this.rocketHit.add(e.uid);
            this.stats.rammed++;
            if (e.shielded && e.shieldHp > 0) this.breakShield(e);
            this.damageEnemy(e, dmg, false, 'moon_rocket');
            if (!e.boss) {
                const k = d > 0.01 ? 1 / d : 0;
                e.knock(k ? dx * k : p.facing, k ? dy * k : 0, def.knockback);
            }
            this.emit({ t: 'ram', x: e.x, y: e.y, boss: e.boss });
        }
    }

    /** God Candle: every bear within `def.radius` of the bull dies (shield or not); a boss loses `bossShare`. */
    _godCandle(def) {
        const p = this.player;
        let wiped = 0;
        for (const e of this.enemies) {
            if (e.hp <= 0 || e.despawned || hypot(e.x - p.x, e.y - p.y) > def.radius) continue;
            if (e.boss) {
                this.damageEnemy(e, e.maxHp * def.bossShare, true, 'god_candle');
                continue;
            }
            e.shielded = false;
            e.shieldHp = 0;
            this.damageEnemy(e, e.hp, false, 'god_candle', true);
            wiped++;
        }
        this.calmUntil = this.time + def.calm;
        this.emit({ t: 'godCandle', x: p.x, y: p.y, r: def.radius, wiped, calm: def.calm });
    }

    // --- The map: solid scenery, piggy banks and pickups ---------------------------------

    /** Push the bull out of any solid prop its feet overlap. */
    collidePlayer() {
        const p = this.player;
        const hit = this.terrain.push(p.x, p.y + p.size * SIM.BODY_FEET, p.size * SIM.BODY_R);
        if (!hit) return;
        p.x += hit.dx;
        p.y += hit.dy;
    }

    /** The piggy banks within BREAK_ACTIVE of the bull, minus the smashed ones (kept as the same objects). */
    _activateBreakables() {
        const p = this.player;
        const R = SIM.BREAK_ACTIVE;
        const had = new Map(this.breakables.map((b) => [b.key, b]));
        const next = [];
        for (const b of this.terrain.breakablesNear(p.x, p.y, R)) {
            if (this.broken.has(b.key)) continue;
            if ((b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) > R * R) continue;
            next.push(had.get(b.key) || new Breakable(b.key, b.x, b.y));
        }
        this.breakables = next;
    }

    /** The bull charging into a piggy bank smashes it. */
    _smashByContact() {
        const p = this.player;
        for (const b of this.breakables) {
            if (b.hp <= 0) continue;
            if (hypot(b.x - p.x, b.y - p.y) < b.size + p.size) {
                b.hp = 0;
                this._smash(b);
            }
        }
    }

    /** A piggy bank breaks: it's gone for the run, and it drops one of PIGGY_LOOT. */
    _smash(b) {
        this.broken.add(b.key);
        this.breakables = this.breakables.filter((x) => x !== b);
        this.stats.smashed++;
        let r = this.rng.next() * PIGGY_LOOT.reduce((a, l) => a + l.weight, 0);
        let loot = PIGGY_LOOT[PIGGY_LOOT.length - 1].id;
        for (const l of PIGGY_LOOT) {
            if (r < l.weight) {
                loot = l.id;
                break;
            }
            r -= l.weight;
        }
        if (loot === 'gold') {
            const v = Math.max(50, Math.floor(this.player.expToNext * GOLD_SHARE));
            this.xp.push(new XpOrb(b.x, b.y, v));
        } else this.pickups.push(new Pickup(b.x, b.y, loot, SIM.PICKUP_LIFE));
        this.emit({ t: 'smash', x: b.x, y: b.y, loot });
    }

    /** The bull walked over a pickup. */
    collectPickup(pk) {
        const p = this.player;
        const def = PICKUPS[pk.kind];
        if (pk.kind === 'chest') return this._openChest(pk);
        this.stats.pickups++;
        let v = 0;
        if (pk.kind === 'ramen') {
            const before = p.hp;
            p.heal(def.heal);
            v = p.hp - before;
        } else if (pk.kind === 'clout') {
            this.stats.clout += def.clout;
            v = def.clout;
        } else if (pk.kind === 'magnet') {
            for (const o of this.xp) {
                if (o.dead || o.fall > 0 || o.frozen || o.vacuum) continue;
                o.vacuum = true;
                v++;
            }
        } else if (pk.kind === 'halt') {
            this.haltUntil = this.time + def.duration;
            for (const e of this.enemies) {
                if (!e.boss || e.hp <= 0) continue;
                e.slowTimer = Math.max(e.slowTimer, def.duration);
                e.slowPct = Math.max(e.slowPct || 0, def.bossSlow);
            }
        } else if (pk.kind === 'squeeze') {
            v = this._squeeze(def);
        }
        this.emit({ t: 'pickupGet', kind: pk.kind, name: def.name, x: pk.x, y: pk.y, v });
    }

    /** Short Squeeze: every bear within `def.radius` of the bull dies; a boss loses `bossShare` of its HP. */
    _squeeze(def) {
        const p = this.player;
        let wiped = 0;
        for (const e of this.enemies) {
            if (e.hp <= 0 || e.despawned || hypot(e.x - p.x, e.y - p.y) > def.radius) continue;
            if (e.boss) {
                this.damageEnemy(e, e.maxHp * def.bossShare, true, 'squeeze');
                continue;
            }
            e.shielded = false;
            e.shieldHp = 0;
            this.damageEnemy(e, e.hp, false, 'squeeze', true);
            wiped++;
        }
        this.emit({ t: 'squeeze', x: p.x, y: p.y, r: def.radius, wiped });
        return wiped;
    }

    /**
     * A boss's treasure chest: one free level-up for a weapon or passive the bull already has (three, with luck),
     * drawn like the cards; an evolution can come out of it. Nothing left to level: it heals instead.
     */
    _openChest(pk) {
        const p = this.player;
        const n = this.rng.next() < SIM.CHEST_TRIPLE ? 3 : 1;
        const items = [];
        for (let k = 0; k < n; k++) {
            const pool = [];
            for (const w of p.weapons) if (w.level < SIM.WEAPON_MAX_LEVEL) pool.push(w);
            for (const id of p.passiveOrder)
                if (p.passives[id].count < SIM.PASSIVE_MAX_STACK) pool.push(p.passives[id]);
            if (!pool.length) {
                p.heal(40);
                items.push({ kind: 'heal', id: 'take_profit', amount: 40 });
                continue;
            }
            const pick = pool[this.rng.int(pool.length)];
            if (pick.levelUp) {
                pick.levelUp();
                const evolves = pick.level === pick.def.evolveLevel;
                items.push({ kind: 'weapon', id: pick.id, level: pick.level, evolves });
                if (evolves) this.emit({ t: 'evolve', id: pick.id });
            } else {
                p.addPassive(pick.def);
                const level = pick.count;
                const evolves = !!pick.def.evolveName && level === SIM.PASSIVE_MAX_STACK;
                items.push({ kind: 'passive', id: pick.def.id, level, evolves });
                if (evolves) this.emit({ t: 'evolve', id: pick.def.id });
            }
        }
        this.stats.chests++;
        this.emit({ t: 'chest', x: pk.x, y: pk.y, items });
    }

    bossAbility(boss) {
        const def = boss.def;
        if (def.ability === 'summon') {
            const child = enemyDef(def.summon);
            for (let i = 0; i < (def.summonCount || 3); i++) {
                const a = this.rng.angle();
                this.enemies.push(
                    new Enemy(boss.x + cos(a) * 80, boss.y + sin(a) * 80, child, 2, 1.5, this)
                );
            }
            this.emit({ t: 'summon', x: boss.x, y: boss.y, id: boss.id });
        } else if (def.ability === 'charge') {
            // Liquidation Warning: mark the spot (up to `chargeDistance` toward the bull, never past him), crouch
            // for `chargeWarn` s, then land there. The ring is the contact radius: inside it, the landing hits.
            const p = this.player;
            const dx = p.x - boss.x;
            const dy = p.y - boss.y;
            const d = hypot(dx, dy) || 1;
            const dist = Math.min(def.chargeDistance || 120, d);
            boss.leapX = boss.x + (dx / d) * dist;
            boss.leapY = boss.y + (dy / d) * dist;
            boss.leapR = boss.size + p.size;
            if (def.chargeWarn > 0) {
                boss.leapWarn = def.chargeWarn;
                this.emit({
                    t: 'chargeWarn',
                    x: boss.leapX,
                    y: boss.leapY,
                    r: boss.leapR,
                    in: def.chargeWarn,
                    id: boss.id
                });
            } else this.bossLand(boss);
        }
    }

    /** A charge boss lands on its marked spot. `hit`: the bull was inside the ring. */
    bossLand(boss) {
        const p = this.player;
        boss.x = boss.leapX;
        boss.y = boss.leapY;
        const hit = hypot(p.x - boss.x, p.y - boss.y) < boss.leapR;
        this.emit({ t: 'charge', x: boss.x, y: boss.y, r: boss.leapR, id: boss.id, hit });
    }

    // --- Combat hooks used by weapons and entities -------------------------

    /** Bear Spray: a shielded bear loses its whole shield at once. */
    breakShield(e) {
        e.shieldHp = 0;
        e.shielded = false;
        this.stats.shieldsBroken++;
        this.emit({ t: 'shieldBreak', x: e.x, y: e.y, r: e.size + 8 });
    }

    /** Apply damage to an enemy and emit the number. Returns damage actually dealt. */
    damageEnemy(e, amount, crit, src, quiet = false) {
        if (e.breakable) {
            if (e.hp > 0) {
                e.takeDamage(amount);
                this._smash(e);
            }
            return 0;
        }
        const dealt = e.takeDamage(amount);
        this.stats.damageDealt += dealt;
        if (e.boss) this.stats.bossDamage += dealt;
        if (!quiet) this.emit({ t: 'dmg', x: e.x, y: e.y - e.size, v: dealt, crit, src });
        // God Candle's boss hit is only drawn as a crit; it doesn't chain
        if (crit && src !== 'liquidation' && src !== 'god_candle')
            this._liquidationChain(e, amount);
        return dealt;
    }

    /** Liquidation Risk (evolved Leverage): a crit arcs on through the nearest bears not hit yet, same damage. */
    _liquidationChain(from, amount) {
        const def = this.player.evolvedPassive('leverage');
        if (!def) return;
        const hit = new Set([from]);
        let at = from;
        for (let k = 0; k < def.evolveChainJumps; k++) {
            let next = null;
            let bestD2 = def.evolveChainRange * def.evolveChainRange;
            for (const e of this.spatial.queryRect(at.x, at.y, def.evolveChainRange)) {
                if (e.hp <= 0 || e.breakable || hit.has(e)) continue;
                const d2 = (e.x - at.x) * (e.x - at.x) + (e.y - at.y) * (e.y - at.y);
                if (d2 < bestD2) {
                    bestD2 = d2;
                    next = e;
                }
            }
            if (!next) return;
            hit.add(next);
            this.stats.liquidations++;
            this.emit({ t: 'liquidation', x1: at.x, y1: at.y, x2: next.x, y2: next.y, k });
            this.damageEnemy(next, amount, true, 'liquidation');
            at = next;
        }
    }

    collectXp(orb) {
        this.pendingLevelUps += this.player.gainExp(orb.value);
        this.emit({ t: 'pickup', x: orb.x, y: orb.y, v: orb.value });
    }

    // --- Level-ups ----------------------------------------------------------

    _upgradePool() {
        const p = this.player;
        const live = [];
        const maxed = [];
        for (const def of Object.values(WEAPONS)) {
            if (def.character && def.character !== this.characterId) continue; // another character's signature
            const w = p.weapons.find((x) => x.id === def.id);
            if (w) {
                if (w.level < SIM.WEAPON_MAX_LEVEL) {
                    live.push({
                        kind: 'weapon',
                        id: def.id,
                        level: w.level + 1,
                        evolves: w.level + 1 === def.evolveLevel
                    });
                } else {
                    maxed.push(def.id);
                }
            } else if (p.weapons.length < SIM.MAX_WEAPONS) {
                live.push({ kind: 'weapon', id: def.id, level: 1, isNew: true });
            }
        }
        for (const def of Object.values(PASSIVES)) {
            const owned = p.passives[def.id];
            if (!owned) {
                if (p.passiveOrder.length < SIM.MAX_PASSIVES)
                    live.push({ kind: 'passive', id: def.id, level: 1, isNew: true });
            } else if (owned.count < SIM.PASSIVE_MAX_STACK) {
                const card = { kind: 'passive', id: def.id, level: owned.count + 1 };
                if (def.evolveName && card.level === SIM.PASSIVE_MAX_STACK) card.evolves = true;
                live.push(card);
            } else {
                maxed.push(def.id);
            }
        }
        return { live, maxed };
    }

    _rollChoices(event = 'levelup') {
        const { live } = this._upgradePool();
        const picks = [];
        const pool = live.slice();
        while (picks.length < 3 && pool.length)
            picks.push(pool.splice(this.rng.int(pool.length), 1)[0]);
        while (picks.length < 3) picks.push({ kind: 'heal', id: 'take_profit', amount: 30 });
        this.choices = picks;
        this.emit({ t: event, level: this.player.level, choices: picks });
    }

    /**
     * Apply the level-up card at `index` (0..2), or CHOICE_REROLL (three new cards, while rerolls last) or
     * CHOICE_SKIP (take none, while skips last). Without one left, those fall back to the last card.
     */
    choose(index) {
        if (!this.choices) return false;
        if (index === CHOICE_REROLL && this.rerolls > 0) {
            this.rerolls--;
            this.stats.rerolls++;
            this._rollChoices('reroll');
            return true;
        }
        if (index === CHOICE_SKIP && this.skips > 0) {
            this.skips--;
            this.stats.skips++;
            this.pendingLevelUps--;
            this.choices = null;
            this.emit({ t: 'skip' });
            if (this.pendingLevelUps > 0) this._rollChoices();
            return true;
        }
        const c = this.choices[Math.max(0, Math.min(this.choices.length - 1, index | 0))];
        const p = this.player;
        if (c.kind === 'weapon') {
            const w = p.weapons.find((x) => x.id === c.id);
            if (w) w.levelUp();
            else p.weapons.push(new Weapon(weaponDef(c.id)));
            if (c.evolves) this.emit({ t: 'evolve', id: c.id });
        } else if (c.kind === 'passive') {
            p.addPassive(Object.values(PASSIVES).find((d) => d.id === c.id));
            if (c.evolves) this.emit({ t: 'evolve', id: c.id });
        } else {
            p.heal(c.amount);
        }
        this.picks++;
        this.pendingLevelUps--;
        this.choices = null;
        if (this.pendingLevelUps > 0) this._rollChoices();
        return true;
    }

    // --- Read-only views ------------------------------------------------------

    get timeMs() {
        return Math.round((this.tick * 1000) / SIM.TICK_RATE);
    }

    summary() {
        return {
            ticks: this.tick,
            timeMs: this.timeMs,
            score: this.stats.score,
            kills: this.stats.kills,
            level: this.player.level,
            bossKills: this.stats.bossKills,
            bossDamage: Math.round(this.stats.bossDamage),
            won: this.won,
            reason: this.endReason,
            stage: this.stageId,
            twist: this.twistId,
            character: this.characterId,
            clout: this.stats.clout,
            smashed: this.stats.smashed,
            chests: this.stats.chests,
            weapons: this.player.weapons.map((w) => [w.id, w.level]),
            passives: this.player.passiveOrder.map((id) => [id, this.player.passives[id].count])
        };
    }

    /** FNV-1a over the exact bits of the state that matters. Used by determinism tests. */
    stateHash() {
        const buf = new Float64Array(1);
        const bytes = new Uint8Array(buf.buffer);
        let h = 0x811c9dc5;
        const mix = (v) => {
            buf[0] = v;
            for (let i = 0; i < 8; i++) h = Math.imul(h ^ bytes[i], 16777619);
        };
        const p = this.player;
        mix(this.tick);
        mix(p.x);
        mix(p.y);
        mix(p.hp);
        mix(p.exp);
        mix(p.level);
        mix(this.stats.kills);
        mix(this.stats.score);
        mix(this.enemies.length);
        for (const e of this.enemies) {
            mix(e.x);
            mix(e.y);
            mix(e.hp);
        }
        for (const v of this.rng.state()) mix(v);
        return (h >>> 0).toString(16).padStart(8, '0');
    }
}
