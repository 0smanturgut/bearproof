/**
 * @module sim/weapons
 * @description One Weapon class driven by a content definition. `type` picks the firing strategy:
 * melee | projectile | instant | aura | mine | nova | drain | orbit. Scaling:
 *   damage   = base * (1 + 0.2 * (lvl - 1)) * player.damageMult (* evolveDamageMult)
 *   cooldown = base * 0.92^(lvl - 1) * player.cooldownMult (* evolveCooldownMult)
 *   range    = base * (1 + 0.1 * (lvl - 1)) * player.areaMult
 * Evolution (level >= evolveLevel) is driven by data flags, never by weapon id.
 */

import { Mine, OrbitShard, Projectile } from './entities.js';
import { atan2, cos, hypot, ipow, sin } from './dmath.js';

export class Weapon {
    constructor(def) {
        this.def = def;
        this.id = def.id;
        this.level = 1;
        this.cooldown = 0;
        this.shards = null;
    }

    levelUp() {
        this.level++;
    }

    isEvolved() {
        return !!this.def.evolveLevel && this.level >= this.def.evolveLevel;
    }

    getDamage(player) {
        let dmg = this.def.baseDamage * (1 + (this.level - 1) * 0.2) * player.getDamageMult();
        if (this.isEvolved() && this.def.evolveDamageMult) dmg *= this.def.evolveDamageMult;
        return dmg;
    }

    getCooldown(player) {
        let cd = this.def.baseCooldown * ipow(0.92, this.level - 1) * player.getCooldownMult();
        if (this.isEvolved() && this.def.evolveCooldownMult) cd *= this.def.evolveCooldownMult;
        return cd;
    }

    getRange(player) {
        return this.def.baseRange * (1 + (this.level - 1) * 0.1) * player.getAreaMult();
    }

    critChance(player) {
        let c = player.getCritChance();
        if (this.isEvolved() && this.def.evolveBonusCrit) c += this.def.evolveBonusCrit;
        return c;
    }

    /** Roll a crit and apply damage through the sim (which emits the number). */
    hit(enemy, base, player, sim) {
        const chance = this.critChance(player);
        const crit = chance > 0 && sim.rng.next() < chance;
        sim.damageEnemy(enemy, crit ? base * 2 : base, crit, this.id);
    }

    update(dt, player, sim) {
        if (this.def.type === 'orbit') {
            this._ensureShards(player);
            for (const s of this.shards) s.update(dt, player, sim, this);
            return;
        }
        this.cooldown -= dt;
        if (this.cooldown <= 0) {
            this.fire(player, sim);
            this.cooldown = this.getCooldown(player);
        }
    }

    orbitCount(player) {
        let n = (this.def.projectileCount || 1) + Math.floor((this.level - 1) / 2);
        if (this.isEvolved()) n *= 2;
        const hf = player.passives.high_frequency?.count || 0;
        return Math.min(12, n + Math.floor(hf / 2));
    }

    _ensureShards(player) {
        const count = this.orbitCount(player);
        const radius = this.getRange(player);
        const dmg = this.getDamage(player);
        if (!this.shards || this.shards.length !== count) {
            this.shards = [];
            for (let i = 0; i < count; i++) this.shards.push(new OrbitShard(i, count, radius, dmg));
        } else {
            for (const s of this.shards) {
                s.radius = radius;
                s.damage = dmg;
            }
        }
    }

    fire(player, sim) {
        switch (this.def.type) {
            case 'melee':
                return this._melee(player, sim);
            case 'projectile':
                return this._projectile(player, sim);
            case 'instant':
                return this._instant(player, sim);
            case 'aura':
                return this._aura(player, sim);
            case 'mine':
                return this._mine(player, sim);
            case 'nova':
                return this._nova(player, sim);
            case 'drain':
                return this._drain(player, sim);
        }
    }

    _melee(player, sim) {
        const range = this.getRange(player);
        const base = this.getDamage(player);
        const evolved = this.isEvolved();
        for (const e of sim.spatial.queryRect(player.x, player.y, Math.max(range, 40))) {
            if (e.hp <= 0) continue;
            const dx = e.x - player.x;
            const dy = e.y - player.y;
            if (evolved) {
                if (hypot(dx, dy) > range) continue;
            } else if (Math.abs(dx) > range || Math.abs(dy) > 40) {
                continue;
            }
            this.hit(e, base, player, sim);
        }
        sim.emit({ t: 'fire', w: this.id, x: player.x, y: player.y, r: range, evolved });
    }

    _projectile(player, sim) {
        let count = (this.def.projectileCount || 1) + Math.floor((this.level - 1) / 2);
        if (this.isEvolved()) {
            if (this.def.evolveMinCount) count = Math.max(count, this.def.evolveMinCount);
            if (this.def.evolveExtraCount) count += this.def.evolveExtraCount;
        }
        const target = sim.spatial.findNearest(player.x, player.y, this.getRange(player));
        if (!target) return;
        const spread = count > 1 ? (this.isEvolved() ? 24 : 14) : 0;
        const base = atan2(target.y - player.y, target.x - player.x);
        const dmg = this.getDamage(player);
        const crit = this.critChance(player);
        for (let i = 0; i < count; i++) {
            const offset = ((i - (count - 1) / 2) * spread * Math.PI) / 180;
            const pr = new Projectile(player.x, player.y, base + offset, this.def, dmg, player);
            pr.critChance = crit;
            sim.projectiles.push(pr);
        }
        sim.emit({ t: 'fire', w: this.id, x: player.x, y: player.y });
    }

    _instant(player, sim) {
        const range = this.getRange(player);
        const base = this.getDamage(player);
        const targets = [];
        for (const e of sim.spatial.queryRect(player.x, player.y, range)) {
            if (e.hp > 0 && hypot(e.x - player.x, e.y - player.y) < range) targets.push(e);
        }
        if (!targets.length) return;
        const evolved = this.isEvolved();
        const strikes = evolved ? Math.min(3, targets.length) : 1;
        const picked = new Set();
        for (let i = 0; i < strikes; i++) {
            let target = null;
            while (picked.size < targets.length) {
                const cand = targets[sim.rng.int(targets.length)];
                if (!picked.has(cand)) {
                    target = cand;
                    picked.add(cand);
                    break;
                }
            }
            if (!target) break;
            sim.emit({ t: 'strike', w: this.id, x: target.x, y: target.y });
            this.hit(target, base, player, sim);
            if (this.def.chain && this.level >= (this.def.chainFromLevel || 3)) {
                let current = target;
                const chained = new Set([current]);
                const hops = evolved ? this.def.chainCount + 2 : this.def.chainCount;
                const hopR = this.def.chainRange || 180;
                for (let c = 0; c < hops; c++) {
                    let nearest = null;
                    let best = Infinity;
                    for (const e of sim.spatial.queryRect(current.x, current.y, hopR)) {
                        if (chained.has(e) || e.hp <= 0) continue;
                        const d = hypot(e.x - current.x, e.y - current.y);
                        if (d < hopR && d < best) {
                            best = d;
                            nearest = e;
                        }
                    }
                    if (!nearest) break;
                    sim.emit({
                        t: 'chain',
                        x1: current.x,
                        y1: current.y,
                        x2: nearest.x,
                        y2: nearest.y
                    });
                    sim.damageEnemy(nearest, base * 0.7, false, this.id);
                    chained.add(nearest);
                    current = nearest;
                }
            }
        }
        sim.emit({ t: 'fire', w: this.id, x: player.x, y: player.y });
    }

    _aura(player, sim) {
        const range = this.getRange(player);
        const dmg = this.getDamage(player);
        for (const e of sim.spatial.queryRect(player.x, player.y, range)) {
            if (e.hp > 0 && hypot(e.x - player.x, e.y - player.y) < range) {
                sim.damageEnemy(e, dmg, false, this.id, true);
            }
        }
    }

    _mine(player, sim) {
        const radius = this.getRange(player);
        const dmg = this.getDamage(player);
        const fuse = this.def.fuse || 1.2;
        sim.mines.push(new Mine(player.x, player.y, radius, dmg, fuse, this.id));
        if (this.isEvolved()) {
            const a = sim.rng.angle();
            sim.mines.push(
                new Mine(
                    player.x + cos(a) * 60,
                    player.y + sin(a) * 60,
                    radius * 0.8,
                    dmg,
                    fuse,
                    this.id
                )
            );
        }
        sim.emit({ t: 'fire', w: this.id, x: player.x, y: player.y });
    }

    _nova(player, sim) {
        const range = this.getRange(player);
        const base = this.getDamage(player);
        const slowPct = this.def.slowPct ?? 0.5;
        const slowDur = this.def.slowDuration ?? 1.2;
        const blast = (r, dmg, crits) => {
            for (const e of sim.spatial.queryRect(player.x, player.y, r)) {
                if (e.hp <= 0 || hypot(e.x - player.x, e.y - player.y) >= r) continue;
                if (crits) this.hit(e, dmg, player, sim);
                else sim.damageEnemy(e, dmg, false, this.id);
                if (!e.slowTimer || e.slowTimer < slowDur) {
                    e.slowTimer = slowDur;
                    e.slowPct = slowPct;
                }
            }
            sim.emit({ t: 'fire', w: this.id, x: player.x, y: player.y, r });
        };
        blast(range, base, true);
        if (this.isEvolved()) {
            // Sim-time delay (0.4 s), so it pauses with the game and replays identically.
            sim.schedule(0.4, () => {
                if (!player.dead) blast(range, base * 0.6, false);
            });
        }
    }

    _drain(player, sim) {
        const range = this.getRange(player);
        const base = this.getDamage(player);
        const steal = this.def.lifestealPct ?? 0.25;
        const n = this.isEvolved() ? 2 : 1;
        const near = [];
        for (const e of sim.enemies) {
            if (e.hp <= 0) continue;
            const d = hypot(e.x - player.x, e.y - player.y);
            if (d < range) near.push({ e, d });
        }
        if (!near.length) return;
        near.sort((a, b) => a.d - b.d);
        let total = 0;
        for (let i = 0; i < n && i < near.length; i++) {
            const e = near[i].e;
            const chance = this.critChance(player);
            const crit = chance > 0 && sim.rng.next() < chance;
            total += sim.damageEnemy(e, crit ? base * 2 : base, crit, this.id);
            sim.emit({ t: 'tether', x1: player.x, y1: player.y, x2: e.x, y2: e.y });
        }
        player.heal(total * steal);
    }
}
