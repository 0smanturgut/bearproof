/**
 * @module sim/entities
 * @description Simulation entities: logic only, no drawing. Every entity advances with `update(dt, sim)`,
 * draws randomness from `sim.rng`, uses sim/dmath for trig, and reports anything visible or audible
 * through `sim.emit(event)`. The renderer turns events into particles, numbers and sound.
 *
 * Ported from the upstream entities (see day-0 src/entities.js); behaviour is unchanged except where the
 * old code used Math.random or wall-clock time.
 */

import { SIM, enemyDef } from './content.js';
import { atan2, cos, hypot, ipow, sin, wrapAngle } from './dmath.js';

let nextEntityId = 1;
/** Reset per simulation so ids (used only for stable hashing/debug) are deterministic. */
export function resetEntityIds() {
    nextEntityId = 1;
}

export class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = SIM.PLAYER_SIZE;
        this.baseMaxHp = SIM.PLAYER_HP;
        this.maxHp = this.baseMaxHp;
        this.hp = this.baseMaxHp;
        this.level = 1;
        this.exp = 0;
        this.expToNext = 50;
        this.weapons = [];
        this.passives = Object.create(null);
        this.passiveOrder = [];
        this.invincibleTimer = 0;
        this.dead = false;
        this.facing = 1;
        this.moving = false;
        this.unhitTimer = 0;
    }

    get invincible() {
        return this.invincibleTimer > 0;
    }

    update(dt, sim, mx, my) {
        const speed =
            SIM.PLAYER_SPEED *
            this.getSpeedMult() *
            (sim.stageMods.playerSpeedMult || 1) *
            (sim.twist?.playerSpeedMult || 1);
        this.x += mx * speed * dt;
        this.y += my * speed * dt;
        this.moving = mx !== 0 || my !== 0;
        if (mx > 0) this.facing = 1;
        else if (mx < 0) this.facing = -1;

        for (const w of this.weapons) w.update(dt, this, sim);

        if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
        const regen = this._sum('hpRegen');
        if (regen) this.heal(regen * dt);
        this.unhitTimer += dt;
    }

    _sum(key) {
        let total = 0;
        for (const id of this.passiveOrder) {
            const p = this.passives[id];
            if (p.def.effect[key] !== undefined) total += p.def.effect[key] * p.count;
        }
        return total;
    }

    _mult(key) {
        let mult = 1;
        for (const id of this.passiveOrder) {
            const p = this.passives[id];
            if (p.def.effect[key] !== undefined) mult *= ipow(1 + p.def.effect[key], p.count);
        }
        return mult;
    }

    addPassive(def) {
        if (!this.passives[def.id]) {
            this.passives[def.id] = { def, count: 0 };
            this.passiveOrder.push(def.id);
        }
        if (this.passives[def.id].count >= SIM.PASSIVE_MAX_STACK) return false;
        this.passives[def.id].count++;
        const prevMax = this.maxHp;
        this.maxHp = this.baseMaxHp * this._mult('maxHpMult');
        this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - prevMax));
        return true;
    }

    getDamageMult() {
        return this._mult('damageMult') * (this.twistDamageMult || 1);
    }
    getAreaMult() {
        return this._mult('areaMult');
    }
    getCooldownMult() {
        return Math.max(0.2, this._mult('cooldownMult'));
    }
    getSpeedMult() {
        return this._mult('speedMult') * (this.characterSpeedMult || 1);
    }
    getExpMult() {
        return this._mult('expMult') * (this.twistExpMult || 1);
    }
    getMagnetRange() {
        return SIM.MAGNET_BASE * this._mult('magnetMult');
    }
    getArmor() {
        return this._sum('armor');
    }
    getCritChance() {
        return this._sum('critChance');
    }
    getDodgeChance() {
        return Math.min(0.6, this._sum('dodgeChance'));
    }
    getDamageReduction() {
        return Math.min(0.6, this._sum('damageReduction'));
    }
    getDamageTakenMult() {
        return 1 + this._sum('damageTakenMult');
    }

    /** Returns the number of level-ups gained. */
    gainExp(amount) {
        this.exp += amount * this.getExpMult();
        let ups = 0;
        while (this.exp >= this.expToNext) {
            this.exp -= this.expToNext;
            this.level++;
            this.expToNext = Math.floor(this.expToNext * 1.2);
            this.hp = Math.min(this.hp + 20, this.maxHp);
            ups++;
        }
        return ups;
    }

    takeDamage(damage, sim) {
        if (this.invincibleTimer > 0 || this.dead) return;
        const dodge = this.getDodgeChance();
        if (dodge > 0 && sim.rng.next() < dodge) {
            sim.emit({ t: 'dodge', x: this.x, y: this.y });
            return;
        }
        const afterArmor = Math.max(1, damage - this.getArmor());
        const taken = Math.max(
            1,
            afterArmor * (1 - this.getDamageReduction()) * this.getDamageTakenMult()
        );
        this.hp -= taken;
        this.invincibleTimer = SIM.INVINCIBILITY;
        this.unhitTimer = 0;
        sim.stats.damageTaken += taken;
        sim.emit({ t: 'hurt', x: this.x, y: this.y, v: taken });
        if (this.hp <= 0) {
            this.hp = 0;
            this.dead = true;
        }
    }

    heal(amount) {
        this.hp = Math.min(this.hp + amount, this.maxHp);
    }
}

export class Enemy {
    constructor(x, y, def, hpMult, dmgMult, sim) {
        this.uid = nextEntityId++;
        this.x = x;
        this.y = y;
        this.def = def;
        this.id = def.id;
        this.size = def.size;
        this.maxHp = def.hp * hpMult;
        this.hp = this.maxHp;
        this.speed = def.speed;
        this.damage = def.damage * dmgMult;
        this.exp = def.exp;
        this.boss = !!def.boss;
        this.flashTimer = 0;
        this.abilityTimer = 3;
        this.facing = -1;
        this.isClone = false;
        this.shielded = !!def.shielded;
        this.shieldHp = def.shieldHp ? def.shieldHp * hpMult : 0;
        const rng = sim.rng;
        this.fireTimer = def.fireCooldown ? def.fireCooldown * (0.5 + rng.next() * 0.5) : 0;
        this.dashTimer = def.dashInterval ? def.dashInterval * (0.3 + rng.next() * 0.7) : 0;
        this.dashActive = 0;
        this.dashAngle = 0;
        this.fuseTimer = 0;
        this.fuseArmed = false;
        this.cloneTimer = def.cloneCooldown ? def.cloneCooldown * (0.6 + rng.next() * 0.8) : 0;
        this.slowTimer = 0;
        this.slowPct = 0;
    }

    update(dt, sim) {
        const def = this.def;
        const p = sim.player;
        const dx = p.x - this.x;
        const dy = p.y - this.y;
        const d = hypot(dx, dy);
        const tx = d > 0.01 ? dx / d : 0;
        const ty = d > 0.01 ? dy / d : 0;
        let vx = 0;
        let vy = 0;

        if (this.slowTimer > 0) this.slowTimer -= dt;
        const slow = this.slowTimer > 0 ? 1 - (this.slowPct || 0) : 1;
        if (this.flashTimer > 0) this.flashTimer -= dt;

        if (def.bomber) {
            if (d < (def.fuseRange || 80)) this.fuseArmed = true;
            if (this.fuseArmed) {
                this.fuseTimer += dt;
                if (this.fuseTimer >= (def.fuseTime || 1.4)) {
                    const r = def.blastRadius || 120;
                    const dmg = (def.blastDamage || 40) * sim.enemyDmgMult;
                    if (hypot(p.x - this.x, p.y - this.y) < r) p.takeDamage(dmg, sim);
                    sim.emit({ t: 'explode', x: this.x, y: this.y, r, src: this.id });
                    this.hp = 0;
                    this.selfDestructed = true;
                    return;
                }
            }
            vx = tx * this.speed * slow;
            vy = ty * this.speed * slow;
        } else {
            if (def.cloner && !this.isClone) {
                this.cloneTimer -= dt;
                if (this.cloneTimer <= 0 && sim.enemies.length < SIM.MAX_ENEMIES) {
                    this.cloneTimer = def.cloneCooldown || 5.5;
                    const n = def.cloneCount || 2;
                    for (let i = 0; i < n; i++) {
                        const a = (i / n) * Math.PI * 2 + sim.rng.next() * 0.4;
                        const clone = new Enemy(
                            this.x + cos(a) * 24,
                            this.y + sin(a) * 24,
                            def,
                            this.maxHp / Math.max(1, def.hp),
                            sim.enemyDmgMult * 0.6,
                            sim
                        );
                        clone.isClone = true;
                        clone.hp = Math.max(8, def.hp * 0.4);
                        clone.maxHp = clone.hp;
                        sim.enemies.push(clone);
                    }
                    sim.emit({ t: 'clone', x: this.x, y: this.y });
                }
            }

            if (def.ranged && def.keepDistance) {
                const keep = def.keepDistance;
                const dir = d > keep + 30 ? 1 : d < keep - 30 ? -1 : 0;
                vx = tx * this.speed * dir * slow;
                vy = ty * this.speed * dir * slow;
                this.fireTimer -= dt;
                if (this.fireTimer <= 0 && d < def.firingRange) {
                    const ang = atan2(dy, dx);
                    sim.enemyProjectiles.push(
                        new EnemyProjectile(
                            this.x,
                            this.y,
                            ang,
                            def.projectileSpeed || 220,
                            def.projectileDamage * sim.enemyDmgMult
                        )
                    );
                    this.fireTimer = def.fireCooldown || 2;
                    sim.emit({ t: 'enemyShot', x: this.x, y: this.y, id: this.id });
                }
            } else if (def.dasher) {
                this.dashTimer -= dt;
                if (this.dashActive > 0) {
                    this.dashActive -= dt;
                    vx = cos(this.dashAngle) * (def.dashSpeed || 300) * slow;
                    vy = sin(this.dashAngle) * (def.dashSpeed || 300) * slow;
                } else if (this.dashTimer <= 0) {
                    this.dashAngle = atan2(dy, dx);
                    this.dashActive = def.dashDuration || 0.5;
                    this.dashTimer = def.dashInterval || 3.5;
                } else {
                    vx = tx * this.speed * slow;
                    vy = ty * this.speed * slow;
                }
            } else {
                vx = tx * this.speed * slow;
                vy = ty * this.speed * slow;
            }
        }

        this.x += vx * dt;
        this.y += vy * dt;
        if (vx > 1) this.facing = 1;
        else if (vx < -1) this.facing = -1;

        if (this.boss) {
            this.abilityTimer -= dt;
            if (this.abilityTimer <= 0) {
                this.abilityTimer = def.abilityCooldown || 5;
                sim.bossAbility(this);
            }
        }
    }

    takeDamage(damage) {
        let dmg = damage;
        if (this.shielded && this.shieldHp > 0) {
            const reduction = this.def.damageReduction ?? 0.5;
            dmg = damage * (1 - reduction);
            this.shieldHp -= damage * reduction;
            if (this.shieldHp <= 0) {
                this.shieldHp = 0;
                this.shielded = false;
            }
        }
        this.hp -= dmg;
        this.flashTimer = 0.08;
        return dmg;
    }
}

export class EnemyProjectile {
    constructor(x, y, angle, speed, damage) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.vx = cos(angle) * speed;
        this.vy = sin(angle) * speed;
        this.damage = damage;
        this.life = 3;
        this.size = 6;
        this.dead = false;
    }
    update(dt, sim) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) {
            this.dead = true;
            return;
        }
        const p = sim.player;
        if (hypot(this.x - p.x, this.y - p.y) < p.size + this.size) {
            p.takeDamage(this.damage, sim);
            this.dead = true;
        }
    }
}

export class Projectile {
    constructor(x, y, angle, def, damage, player) {
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        this.angle = angle;
        this.def = def;
        this.id = def.id;
        this.damage = damage;
        this.size = 8;
        this.speed = def.speed || 300;
        this.piercing = !!def.piercing;
        this.homing = !!def.homing;
        this.boomerang = !!def.boomerang;
        this.vx = cos(angle) * this.speed;
        this.vy = sin(angle) * this.speed;
        this.life = 4;
        this.hit = new Set();
        this.dead = false;
        this.travel = 0;
        this.maxDist = (def.baseRange || 300) * player.getAreaMult();
        this.returning = false;
    }

    update(dt, sim) {
        if (this.homing && this.hit.size === 0) {
            const target = sim.spatial.findNearest(this.x, this.y, 9999);
            if (target) {
                const diff = wrapAngle(atan2(target.y - this.y, target.x - this.x) - this.angle);
                this.angle += diff * Math.min(1, 6 * dt);
                this.vx = cos(this.angle) * this.speed;
                this.vy = sin(this.angle) * this.speed;
            }
        }
        if (
            this.boomerang &&
            hypot(this.x - this.startX, this.y - this.startY) > this.maxDist * 0.5
        ) {
            const ra = atan2(sim.player.y - this.y, sim.player.x - this.x);
            this.returning = true;
            this.angle = ra;
            this.vx = cos(ra) * this.speed;
            this.vy = sin(ra) * this.speed;
        }
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.travel += this.speed * dt;
        this.life -= dt;
        if (this.travel > this.maxDist || this.life <= 0) this.dead = true;
        if (
            this.boomerang &&
            this.travel > 60 &&
            hypot(this.x - sim.player.x, this.y - sim.player.y) < 24
        ) {
            this.dead = true;
        }
    }
}

/** Orbiting diamond. Owned and updated by its Weapon. */
export class OrbitShard {
    constructor(index, total, radius, damage) {
        this.index = index;
        this.total = total;
        this.radius = radius;
        this.damage = damage;
        this.angle = (index / total) * Math.PI * 2;
        this.cooldowns = new Map();
        this.x = 0;
        this.y = 0;
    }
    update(dt, player, sim, weapon) {
        this.angle += dt * 2.4;
        this.x = player.x + cos(this.angle) * this.radius;
        this.y = player.y + sin(this.angle) * this.radius;
        for (const [enemy, t] of this.cooldowns) {
            if (t - dt <= 0) this.cooldowns.delete(enemy);
            else this.cooldowns.set(enemy, t - dt);
        }
        const HIT = 10;
        for (const e of sim.spatial.queryRect(this.x, this.y, HIT + 64)) {
            if (this.cooldowns.has(e) || e.hp <= 0) continue;
            if (hypot(e.x - this.x, e.y - this.y) < e.size + HIT) {
                sim.damageEnemy(e, this.damage, false, weapon.id);
                this.cooldowns.set(e, 0.5);
            }
        }
    }
}

export class Mine {
    constructor(x, y, radius, damage, fuse, weaponId) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.damage = damage;
        this.fuse = fuse;
        this.maxFuse = fuse;
        this.weaponId = weaponId;
        this.dead = false;
    }
    update(dt, sim) {
        this.fuse -= dt;
        if (this.fuse > 0) return;
        for (const e of sim.spatial.queryRect(this.x, this.y, this.radius)) {
            if (e.hp > 0 && hypot(e.x - this.x, e.y - this.y) < this.radius) {
                sim.damageEnemy(e, this.damage, false, this.weaponId);
            }
        }
        sim.emit({ t: 'explode', x: this.x, y: this.y, r: this.radius, src: this.weaponId });
        this.dead = true;
    }
}

export class XpOrb {
    constructor(x, y, value) {
        this.x = x;
        this.y = y;
        this.value = value;
        this.life = SIM.XP_LIFETIME;
        this.speed = 0;
        this.dead = false;
    }
    update(dt, sim) {
        this.life -= dt;
        if (this.life <= 0) {
            this.dead = true;
            return;
        }
        const p = sim.player;
        const dx = p.x - this.x;
        const dy = p.y - this.y;
        const d = hypot(dx, dy);
        if (d < SIM.PICKUP_DISTANCE) {
            sim.collectXp(this);
            this.dead = true;
            return;
        }
        if (d < p.getMagnetRange()) {
            this.speed = Math.min(this.speed + 600 * dt, 560);
            this.x += (dx / d) * this.speed * dt;
            this.y += (dy / d) * this.speed * dt;
        }
    }
}

export { enemyDef };
