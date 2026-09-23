/**
 * @module sim/sim
 * @description The deterministic BEARPROOF simulation. No DOM, no audio, no clocks, no Math.random.
 *
 *   const sim = new Simulation({ seed, twist });   // twist: a TWISTS id for the Daily Challenge, else none
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
    PASSIVES,
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
    weaponDef
} from './content.js';
import { cos, hypot, sin } from './dmath.js';
import { Enemy, Player, XpOrb, resetEntityIds } from './entities.js';
import { MOVE_TABLE, isValidCode } from './input-codes.js';
import { Rng } from './rng.js';
import { SpatialHash } from './spatial.js';
import { Weapon } from './weapons.js';

/** Bump when a change alters simulation results for the same inputs. 2: daily twists. */
export const SIM_VERSION = 2;

export class Simulation {
    constructor({ seed = 1, stage = null, twist = null } = {}) {
        resetEntityIds();
        this.seed = seed >>> 0;
        this.stageId = stage || stageForSeed(this.seed);
        this.twist = twistDef(twist);
        this.twistId = this.twist.id;
        this.rng = new Rng(this.seed);
        this.stageMods = stageModifiers(this.stageId);
        this.waves = wavesFor(this.stageId);
        this.bossPlan = bossesFor(this.stageId);
        this.bossWarned = new Set();
        this.bossSpawned = new Set();

        this.tick = 0;
        this.time = 0;
        this.player = new Player(0, 0);
        this.player.twistDamageMult = this.twist.playerDamageMult;
        this.player.twistExpMult = this.twist.xpMult;
        this.player.weapons.push(new Weapon(weaponDef(STARTER_WEAPON)));
        this.enemies = [];
        this.projectiles = [];
        this.enemyProjectiles = [];
        this.mines = [];
        this.xp = [];
        this.delayed = [];
        this.spatial = new SpatialHash(64);

        this.spawnAcc = 0;
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
        this.stats = { kills: 0, score: 0, bossKills: 0, damageTaken: 0, damageDealt: 0 };
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

        this.spatial.rebuild(this.enemies);
        const p = this.player;
        p.update(dt, this, mx, my);
        if (p.dead) return this._end('liquidated');

        this._coldTick(dt);
        this._updateEnemies(dt);
        if (p.dead) return this._end('liquidated');
        this._updateProjectiles(dt);
        this._updateList(this.enemyProjectiles, dt);
        this._updateList(this.mines, dt);
        this._runDelayed(dt);
        this._cullDead();
        this._updateList(this.xp, dt);
        this._spawn(dt);
        if (p.dead) return this._end('liquidated');

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
            this.wave = w;
            this.emit({ t: 'wave', label: w.label });
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
            if (d < e.size + p.size && !p.invincible) p.takeDamage(e.damage, this);
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

    _onKilled(e, born) {
        if (!e.selfDestructed) {
            this.stats.kills++;
            this.stats.score += e.boss ? e.exp * SIM.BOSS_SCORE_MULT : e.exp;
            this.xp.push(new XpOrb(e.x, e.y, e.exp));
        }
        this.emit({ t: 'kill', x: e.x, y: e.y, id: e.id, boss: e.boss, self: !!e.selfDestructed });
        if (e.boss) {
            this.stats.bossKills++;
            this.emit({ t: 'bossDown', id: e.id, name: e.def.name, x: e.x, y: e.y });
            if (e.def.final) this.won = true;
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
    }

    _spawn(dt) {
        const wave = this.wave;
        const max = Math.min(SIM.MAX_ENEMIES, 20 + Math.floor(this.time / 10));
        const interval =
            Math.max(0.2, 1.2 - this.time / 200) / ((wave.spawnMult || 1) * this.twist.spawnMult);
        this.spawnAcc += dt;
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
                const d = SIM.SPAWN_RADIUS * 0.8;
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
            const dx = this.player.x - boss.x;
            const dy = this.player.y - boss.y;
            const d = hypot(dx, dy) || 1;
            const dist = def.chargeDistance || 120;
            boss.x += (dx / d) * dist;
            boss.y += (dy / d) * dist;
            this.emit({ t: 'charge', x: boss.x, y: boss.y, id: boss.id });
        }
    }

    // --- Combat hooks used by weapons and entities -------------------------

    /** Apply damage to an enemy and emit the number. Returns damage actually dealt. */
    damageEnemy(e, amount, crit, src, quiet = false) {
        const dealt = e.takeDamage(amount);
        this.stats.damageDealt += dealt;
        if (!quiet) this.emit({ t: 'dmg', x: e.x, y: e.y - e.size, v: dealt, crit, src });
        return dealt;
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
                live.push({ kind: 'passive', id: def.id, level: owned.count + 1 });
            } else {
                maxed.push(def.id);
            }
        }
        return { live, maxed };
    }

    _rollChoices() {
        const { live } = this._upgradePool();
        const picks = [];
        const pool = live.slice();
        while (picks.length < 3 && pool.length)
            picks.push(pool.splice(this.rng.int(pool.length), 1)[0]);
        while (picks.length < 3) picks.push({ kind: 'heal', id: 'take_profit', amount: 30 });
        this.choices = picks;
        this.emit({ t: 'levelup', level: this.player.level, choices: picks });
    }

    /** Apply the level-up card at `index` (0..2). */
    choose(index) {
        if (!this.choices) return false;
        const c = this.choices[Math.max(0, Math.min(this.choices.length - 1, index | 0))];
        const p = this.player;
        if (c.kind === 'weapon') {
            const w = p.weapons.find((x) => x.id === c.id);
            if (w) w.levelUp();
            else p.weapons.push(new Weapon(weaponDef(c.id)));
            if (c.evolves) this.emit({ t: 'evolve', id: c.id });
        } else if (c.kind === 'passive') {
            p.addPassive(Object.values(PASSIVES).find((d) => d.id === c.id));
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
            won: this.won,
            reason: this.endReason,
            stage: this.stageId,
            twist: this.twistId,
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
