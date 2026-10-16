/**
 * @module ui
 * @description DOM screens and HUD. Pure presentation: it shows what the game tells it and reports clicks
 * back through callbacks. Nothing here touches the simulation directly.
 */

import { ICONS, bakeIcon, bakeSprite } from './art/sprites.js';
import { CHARACTERS, PASSIVES, STAGES, WEAPONS } from './sim/content.js';
import { fmtNum, fmtTime } from './format.js';
import { ETERNAL_BEAR, MARKET, bearHp, levelForXp } from './profile.js';

const STAGE_NAME = Object.fromEntries(Object.values(STAGES).map((s) => [s.id, s.name]));
const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

export { fmtNum, fmtTime };

const $ = (id) => document.getElementById(id);
const WEAPON_BY_ID = Object.fromEntries(Object.values(WEAPONS).map((d) => [d.id, d]));
const PASSIVE_BY_ID = Object.fromEntries(Object.values(PASSIVES).map((d) => [d.id, d]));

function esc(s) {
    return String(s).replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
}

/** Draw an icon (or sprite) into a canvas element at an integer scale. */
export function paintIcon(canvas, id, scale = 4) {
    let frames = null;
    try {
        frames = ICONS && ICONS[id] ? bakeIcon(id, scale) : bakeSprite(id, scale);
    } catch {
        frames = null;
    }
    const img = frames && frames[0];
    const ctx = canvas.getContext('2d');
    if (!img) {
        canvas.width = 12 * scale;
        canvas.height = 12 * scale;
        ctx.fillStyle = '#252E3A';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
}

export class UI {
    constructor() {
        this.screens = [
            'screenTitle',
            'screenLevel',
            'screenPause',
            'screenOver',
            'screenBoard',
            'screenSettings',
            'screenShare',
            'screenGuide',
            'screenMarket'
        ];
        this.hud = {
            level: $('hLevel'),
            xp: $('hXp'),
            hp: $('hHp'),
            hpGhost: $('hHpGhost'),
            hpVal: $('hHpVal'),
            badge: $('hLevel').parentElement,
            hpBar: $('hHp').parentElement,
            bossGhost: $('bossGhost'),
            time: $('hTime'),
            wave: $('hWave'),
            score: $('hScore'),
            bossbar: $('bossbar'),
            bossName: $('bossName'),
            bossHp: $('bossHp'),
            loadout: $('loadout')
        };
        this._last = {};
        this._toastTimer = 0;
        this._bossTimer = 0;
        this._loadoutKey = '';
    }

    show(id) {
        for (const s of this.screens) $(s).hidden = s !== id;
        document.body.classList.toggle('on-title', id === 'screenTitle');
        if (id === 'screenLevel') $('toast').classList.remove('show');
        const inGame = id === null || id === 'screenLevel';
        $('hud').hidden = !(inGame || id === 'screenPause');
        document.body.classList.toggle('no-hud', $('hud').hidden);
        this.hud.loadout.hidden = $('hud').hidden;
        if (id) {
            const visible = (sel) =>
                [...$(id).querySelectorAll(sel)].find((e) => e.offsetParent !== null);
            const first = visible('.btn-primary') || visible('button, [href], input');
            if (first && !matchMedia('(pointer: coarse)').matches)
                first.focus({ preventScroll: true });
        }
    }

    hideAll() {
        this.show(null);
    }

    setBuildLabel(text) {
        for (const el of document.querySelectorAll('.buildLabel')) el.textContent = text;
    }

    announce(msg) {
        const el = $('sr');
        el.textContent = '';
        requestAnimationFrame(() => (el.textContent = msg));
    }

    // --- HUD ---------------------------------------------------------------

    updateHud(sim) {
        const p = sim.player;
        const set = (key, val, fn) => {
            if (this._last[key] !== val) {
                this._last[key] = val;
                fn(val);
            }
        };
        set('lvl', p.level, (v) => {
            this.hud.level.textContent = v;
            const b = this.hud.badge;
            b.classList.remove('pop');
            void b.offsetWidth;
            b.classList.add('pop');
        });
        set(
            'xp',
            Math.floor((p.exp / p.expToNext) * 100),
            (v) => (this.hud.xp.style.width = `${v}%`)
        );
        const hpPct = Math.max(0, Math.round((p.hp / p.maxHp) * 100));
        set('hp', hpPct, (v) => {
            this.hud.hp.style.width = `${v}%`;
            this.hud.hpGhost.style.width = `${v}%`; // trails behind: the damage you just took
            this.hud.hpBar.classList.toggle('low', v < 30);
        });
        set(
            'hpv',
            Math.ceil(p.hp),
            (v) => (this.hud.hpVal.textContent = `${v}/${Math.round(p.maxHp)}`)
        );
        set('time', Math.floor(sim.time), () => (this.hud.time.textContent = fmtTime(sim.timeMs)));
        set('score', sim.stats.score, (v) => (this.hud.score.textContent = fmtNum(v)));
        set('wave', sim.wave.label, (v) => (this.hud.wave.textContent = v));

        const boss = sim.enemies.find((e) => e.boss && e.hp > 0);
        set('boss', boss ? boss.uid : 0, () => {
            this.hud.bossbar.hidden = !boss;
            if (boss) this.hud.bossName.textContent = boss.def.name.toUpperCase();
        });
        if (boss) {
            const w = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
            this.hud.bossHp.style.width = w;
            this.hud.bossGhost.style.width = w;
        }

        const key =
            p.weapons.map((w) => w.id + w.level).join() +
            '|' +
            p.passiveOrder.map((id) => id + p.passives[id].count).join();
        if (key !== this._loadoutKey) {
            this._loadoutKey = key;
            this.hud.loadout.innerHTML = '';
            for (const w of p.weapons)
                this._slot(w.def.icon, w.level >= 5 ? '★' : w.level, false, w.level >= 5);
            if (p.passiveOrder.length) {
                const br = document.createElement('div');
                br.className = 'slot-break';
                this.hud.loadout.appendChild(br);
            }
            for (const id of p.passiveOrder)
                this._slot(
                    PASSIVE_BY_ID[id].icon,
                    p.passives[id].count,
                    true,
                    p.passives[id].count >= 5
                );
        }
    }

    _slot(icon, badge, passive, maxed) {
        const el = document.createElement('div');
        el.className = (passive ? 'slot passive' : 'slot') + (maxed ? ' maxed' : '');
        const c = document.createElement('canvas');
        paintIcon(c, icon, 2);
        el.appendChild(c);
        const b = document.createElement('b');
        b.textContent = badge;
        el.appendChild(b);
        this.hud.loadout.appendChild(el);
    }

    resetHud() {
        this._last = {};
        this._loadoutKey = '';
        this.hud.bossbar.hidden = true;
    }

    toast(text, tone = 'gold', ms = 1400) {
        const el = $('toast');
        el.textContent = text;
        el.className = `toast ${tone} show`;
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => el.classList.remove('show'), ms);
        this.announce(text);
    }

    bossIntro(name, tagline, id) {
        const card = $('bossCard');
        $('toast').classList.remove('show');
        const portrait = $('bossPortrait');
        portrait.hidden = !id;
        if (id) paintIcon(portrait, id, 4);
        $('bossTitle').textContent = name;
        $('bossTag').textContent = tagline || '';
        const item = `BREAKING: ${name.toUpperCase()} SPOTTED ON THE CHART  ▼  VOLATILITY EXTREME  ▼  HOLD YOUR HORNS`;
        $('bossTicker').textContent = `${item}  ·  ${item}`;
        card.hidden = false;
        card.style.animation = 'none';
        void card.offsetWidth;
        card.style.animation = '';
        clearTimeout(this._bossTimer);
        this._bossTimer = setTimeout(() => (card.hidden = true), 2400);
        this.announce(`Boss incoming: ${name}`);
    }

    moveHint(on) {
        $('hint').hidden = !on;
    }

    // --- Level-up ------------------------------------------------------------

    /** Render three cards; `onPick(i)` fires once. Taps are ignored for a moment so a held thumb can't misfire. */
    showLevelUp(level, choices, onPick) {
        $('lvN').textContent = level;
        const wrap = $('cards');
        wrap.innerHTML = '';
        wrap.classList.add('locked');
        let armed = false;
        let done = false;
        const pick = (i) => {
            if (!armed || done) return;
            done = true;
            onPick(i);
        };
        choices.forEach((c, i) => {
            const def =
                c.kind === 'weapon'
                    ? WEAPON_BY_ID[c.id]
                    : c.kind === 'passive'
                      ? PASSIVE_BY_ID[c.id]
                      : null;
            const btn = document.createElement('button');
            btn.className =
                'card' +
                (c.kind === 'passive' ? ' kind-passive' : ' kind-weapon') +
                (c.evolves ? ' evo' : '') +
                (c.kind === 'heal' ? ' heal' : '');
            btn.setAttribute('role', 'menuitem');
            const name = def ? def.name : 'Take Profit';
            const tag =
                c.kind === 'heal'
                    ? 'HEAL'
                    : c.evolves
                      ? 'EVOLVES'
                      : c.isNew
                        ? 'NEW'
                        : `LV ${c.level - 1} → ${c.level}`;
            const tagCls = c.evolves ? 'evo' : c.isNew ? 'new' : '';
            const desc = def
                ? def.description
                : `Everything is maxed. Bank it: heal ${c.amount} HP.`;
            const evo =
                c.evolves && def?.evolveName
                    ? `→ ${def.evolveName}: ${def.evolveDescription || ''}`
                    : '';
            const kind =
                c.kind === 'heal' ? 'CASH OUT' : c.kind === 'passive' ? 'PASSIVE' : 'WEAPON';
            const pips =
                c.kind === 'heal'
                    ? ''
                    : `<div class="pips">${Array.from({ length: 5 }, (_, k) => `<i class="${k < (c.level || 1) - 1 ? 'on' : k === (c.level || 1) - 1 ? 'next' : ''}"></i>`).join('')}</div>`;
            btn.innerHTML = `
                <div class="card-icon-wrap"><canvas class="card-icon"></canvas></div>
                <div class="card-body">
                    <div class="card-top"><span class="card-kind">${kind}</span><span class="card-tag ${tagCls}">${tag}</span></div>
                    <b class="card-name">${esc(name)}</b>
                    <p class="card-desc">${esc(desc)}</p>
                    ${evo ? `<p class="card-evo">${esc(evo)}</p>` : ''}
                    ${pips}
                </div>
                <kbd>${i + 1}</kbd>`;
            paintIcon(btn.querySelector('canvas'), def?.icon || 'dca', 4);
            btn.addEventListener('click', () => pick(i));
            btn.setAttribute('aria-label', `${name}, ${tag}. ${desc} ${evo}`);
            wrap.appendChild(btn);
        });
        this.show('screenLevel');
        setTimeout(() => {
            armed = true;
            wrap.classList.remove('locked');
        }, 380);
        this._levelKeys = (key) => {
            const n = Number(key);
            if (n >= 1 && n <= choices.length) pick(n - 1);
        };
        this.announce(`Level ${level}. Choose an upgrade.`);
    }

    levelKey(key) {
        this._levelKeys?.(key);
    }

    // --- Title / over / board / settings ---------------------------------------

    setDailyTwist(text) {
        const el = $('dailyTwist');
        el.textContent = text;
        el.hidden = !text;
    }

    /** The AI's bounty on the Daily card: its name and the condition, or hidden (null). */
    setDailyBounty(name, condition) {
        $('dailyBounty').hidden = !name;
        $('bountyName').textContent = name || '';
        $('bountyCond').textContent = condition || '';
    }

    /** The HUD bounty chip during a Daily run; `progress` from bountyProgress(), or null to hide it. */
    hudBounty(progress) {
        const el = $('hBounty');
        el.hidden = !progress;
        if (!progress || el.textContent === progress.text) return;
        el.textContent = progress.text;
        const pop = progress.done && !el.classList.contains('done');
        el.classList.toggle('done', progress.done);
        if (pop) {
            el.classList.remove('pop');
            void el.offsetWidth;
            el.classList.add('pop');
        }
    }

    /** The bounty row on the receipt and its note; null hides both. */
    overBounty(info) {
        const row = $('overBountyRow');
        const note = $('overBountyNote');
        row.hidden = !info;
        note.hidden = !info?.note;
        if (!info) return;
        row.classList.toggle('done', info.done);
        $('overBounty').textContent = info.value;
        note.textContent = info.note || '';
        note.className = `bounty-note ${info.done ? 'good' : ''}`;
    }

    setDailySub(text) {
        $('dailySub').textContent = text;
    }

    setTodayTop(text) {
        $('todayTop').textContent = text || '';
    }

    /** The title screen's profile strip: player level, its bar and the CLOUT balance; it opens the Market. */
    profileStrip(profile) {
        const lv = levelForXp(profile.xp);
        $('btnProfile').hidden = false;
        $('psLevel').textContent = lv.level;
        $('psXp').textContent = `${fmtNum(lv.into)} / ${fmtNum(lv.need)} XP`;
        $('psBar').style.width = `${Math.round((lv.into / lv.need) * 100)}%`;
        $('psClout').textContent = fmtNum(profile.clout);
        $('btnProfile').setAttribute(
            'aria-label',
            `Player level ${lv.level}, ${profile.clout} CLOUT. Open the Market.`
        );
    }

    /**
     * The receipt's CLOUT block: each line counts up, then the total, then the level bar fills (a level-up pops
     * it and pays its bonus), then the Eternal Bear line. Instant with reduced motion.
     */
    cloutReceipt(banked, sounds = {}) {
        const box = $('overClout');
        clearTimeout(this._cloutTimer);
        if (!banked) {
            box.hidden = true;
            return;
        }
        box.hidden = false;
        box.classList.remove('lvup');
        const { payout, before, after, levelUps, levelReward, bear, profile } = banked;
        const list = $('cloutLines');
        list.innerHTML = '';
        const rows = payout.lines.map((l) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${esc(l.label)}${l.detail ? ` <small>${esc(l.detail)}</small>` : ''}</span><b>+0</b>`;
            list.appendChild(li);
            return { li, b: li.querySelector('b'), v: l.v };
        });
        if (levelReward) {
            const li = document.createElement('li');
            li.className = 'lv';
            li.innerHTML = `<span>LEVEL UP <small>LV ${levelUps[levelUps.length - 1]}</small></span><b>+0</b>`;
            list.appendChild(li);
            rows.push({ li, b: li.querySelector('b'), v: levelReward, level: true });
        }
        if (bear.reward) {
            const li = document.createElement('li');
            li.className = 'bear';
            li.innerHTML = `<span>ETERNAL BEAR FELLED</span><b>+0</b>`;
            list.appendChild(li);
            rows.push({ li, b: li.querySelector('b'), v: bear.reward, bear: true });
        }
        const total = $('cloutTotal');
        const lvEl = $('cloutLv');
        const bar = $('cloutBar');
        const bal = $('cloutBal');
        const startBal = profile.clout - payout.total - levelReward - bear.reward;
        const setBar = (lv) => {
            lvEl.textContent = `LV ${lv.level}`;
            bar.style.width = `${Math.round((lv.into / lv.need) * 100)}%`;
        };
        const bearLine = () => {
            const el = $('cloutBear');
            el.hidden = !bear.damage && !bear.felled;
            const left = bear.hp - bear.after;
            el.textContent = bear.felled
                ? `${ETERNAL_BEAR.name.toUpperCase()} FELLED. It's back with ${fmtNum(bear.hp)} HP.`
                : `${fmtNum(bear.damage)} boss damage hit ${ETERNAL_BEAR.name}: ${fmtNum(left)} HP left.`;
        };
        let sum = 0;
        if (sounds.calm || reduced()) {
            for (const r of rows) r.b.textContent = `+${fmtNum(r.v)}`;
            sum = rows.reduce((a, r) => a + r.v, 0);
            total.textContent = `+${fmtNum(sum)}`;
            bal.textContent = `${fmtNum(profile.clout)} CLOUT`;
            setBar(after);
            if (levelUps.length) box.classList.add('lvup');
            bearLine();
            return;
        }
        setBar(before);
        bal.textContent = `${fmtNum(startBal)} CLOUT`;
        total.textContent = '+0';
        $('cloutBear').hidden = true;
        let i = 0;
        let shown = 0;
        const STEPS = 10;
        let k = 0;
        const step = () => {
            if ($('screenOver').hidden) return; // PLAY AGAIN mid count-up: stop ticking into the new run
            const r = rows[i];
            if (!r) {
                bearLine();
                return;
            }
            if (k === 0) {
                r.li.classList.add('on');
                if (r.level) {
                    setBar(after);
                    box.classList.add('lvup');
                    sounds.levelUp?.();
                }
                if (r.bear) sounds.bear?.();
            }
            k++;
            const v = Math.round((r.v * k) / STEPS);
            r.b.textContent = `+${fmtNum(v)}`;
            total.textContent = `+${fmtNum(shown + v)}`;
            bal.textContent = `${fmtNum(startBal + shown + v)} CLOUT`;
            if (!r.level && !r.bear) {
                // the bar fills as the run's CLOUT (its XP) comes in
                const done = Math.min(shown + v, payout.total);
                setBar(levelForXp(profile.xp - payout.total + done));
            }
            if (k % 2 === 0 && r.v) sounds.tick?.();
            if (k >= STEPS) {
                shown += r.v;
                i++;
                k = 0;
                this._cloutTimer = setTimeout(step, 160);
            } else this._cloutTimer = setTimeout(step, 28);
        };
        this._cloutTimer = setTimeout(step, 450);
    }

    /**
     * The Market: tabs for skins, trails, finales and the profile's stats. `state` is { profile, tab };
     * handlers: buy(id), equip(id), tab(id).
     */
    showMarket(profile, tab, handlers) {
        const tabs = [
            ['skins', 'Skins', 'Redrawn looks for the bull and Pepe. Same hitbox, same stats.'],
            ['trail', 'Trails', 'What the bull leaves behind while it runs.'],
            ['finale', 'Finales', 'How a run goes out on the game-over beat.'],
            ['stats', 'Profile', 'Everything this device remembers about you.']
        ];
        const current = tabs.find((t) => t[0] === tab) || tabs[0];
        $('marketBal').textContent = fmtNum(profile.clout);
        const tabEl = $('marketTabs');
        tabEl.innerHTML = '';
        for (const [id, label] of tabs) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'guide-tab';
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-selected', String(id === current[0]));
            b.innerHTML = `<span>${esc(label.toUpperCase())}</span>`;
            b.addEventListener('click', () => handlers.tab(id));
            tabEl.appendChild(b);
        }
        $('marketIntro').textContent = current[2];
        const list = $('marketList');
        list.innerHTML = '';
        list.dataset.tab = current[0];
        if (current[0] === 'stats') this._marketStats(list, profile);
        else {
            const items = MARKET.filter((i) =>
                current[0] === 'skins' ? i.slot.startsWith('skin:') : i.slot === current[0]
            );
            for (const item of items) {
                const owned = profile.owned.includes(item.id);
                const on = profile.equipped[item.slot] === item.id;
                const li = document.createElement('li');
                li.className = 'guide-entry market-item' + (on ? ' on' : '');
                const who = item.slot.startsWith('skin:')
                    ? CHARACTERS[item.slot.slice(5)]?.name.replace(/^The /, '').toUpperCase()
                    : '';
                const short = !owned && profile.clout < item.price;
                const label = on ? 'EQUIPPED' : owned ? 'EQUIP' : `${fmtNum(item.price)} CLOUT`;
                li.innerHTML = `
                    <div class="guide-art"><canvas aria-hidden="true"></canvas></div>
                    <div class="guide-body">
                        <b class="guide-name">${esc(item.name)}</b>
                        ${who ? `<span class="guide-tag">${esc(who)}</span>` : ''}
                        <p class="guide-text">${esc(item.text)}</p>
                    </div>
                    <button type="button" class="btn market-btn ${on ? 'is-on' : owned ? 'is-owned' : short ? 'is-short' : 'is-buy'}" ${on ? 'disabled' : ''}>${label}</button>`;
                paintIcon(
                    li.querySelector('canvas'),
                    item.sprite || item.icon,
                    item.sprite ? 2 : 3
                );
                const btn = li.querySelector('button');
                btn.setAttribute(
                    'aria-label',
                    `${item.name}${who ? ` for ${who}` : ''}: ${on ? 'equipped' : owned ? 'equip' : `buy for ${item.price} CLOUT`}`
                );
                btn.addEventListener('click', () =>
                    owned ? handlers.equip(item.id) : handlers.buy(item.id, btn)
                );
                list.appendChild(li);
            }
        }
        if ($('screenMarket').hidden) {
            list.scrollTop = 0;
            this.show('screenMarket');
        }
    }

    _marketStats(list, p) {
        const lv = levelForXp(p.xp);
        const rows = [
            ['Player level', `LV ${lv.level} · ${fmtNum(lv.into)} / ${fmtNum(lv.need)} XP`],
            ['Runs', fmtNum(p.runs)],
            ['Time in the market', fmtTime(p.timeMs)],
            ['Bears rekt', fmtNum(p.kills)],
            ['Bosses rekt', fmtNum(p.bossKills)],
            ['Bear markets ended', fmtNum(p.wins)],
            ['AI bounties cleared', fmtNum(p.bounties)],
            ['CLOUT earned, all time', fmtNum(p.earned)]
        ];
        for (const [id, b] of Object.entries(p.best.character))
            rows.push([
                `Best as ${CHARACTERS[id]?.name.replace(/^The /, '') || id}`,
                `${fmtNum(b.score)} · ${fmtTime(b.timeMs)}`
            ]);
        for (const [id, b] of Object.entries(p.best.stage))
            rows.push([
                `Best on ${STAGE_NAME[id] || id}`,
                `${fmtNum(b.score)} · ${fmtTime(b.timeMs)}`
            ]);
        const hp = bearHp(p.bear.tier);
        const left = hp - p.bear.damage;
        const bear = document.createElement('li');
        bear.className = 'eternal-bear';
        bear.innerHTML = `
            <div class="eb-head"><canvas aria-hidden="true"></canvas><div>
                <b class="guide-name">${esc(ETERNAL_BEAR.name.toUpperCase())}</b><span class="guide-tag">TIER ${p.bear.tier}</span>
                <p class="guide-text">Every boss hit in every run drains this bar. Fell it for CLOUT; it comes back bigger. Felled ${fmtNum(p.bear.felled)}×.</p>
            </div></div>
            <div class="bar bar-boss"><i style="width:${Math.max(0, (left / hp) * 100)}%"></i></div>
            <p class="eb-hp">${fmtNum(left)} / ${fmtNum(hp)} HP</p>`;
        paintIcon(bear.querySelector('canvas'), 'bear_market', 1);
        list.appendChild(bear);
        const li = document.createElement('li');
        li.className = 'market-stats';
        li.innerHTML = `<dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
        list.appendChild(li);
    }

    showOver(info, sounds) {
        const { summary, title, sub, buildLine } = info;
        const t = $('overTitle');
        t.textContent = title;
        t.classList.toggle('win', summary.won);
        $('overSub').textContent = sub;
        $('overScore').textContent = fmtNum(summary.score);
        $('overTime').textContent = fmtTime(summary.timeMs);
        $('overKills').textContent = fmtNum(summary.kills);
        $('overLevel').textContent = summary.level;
        $('overBuild').textContent = buildLine;
        $('overRank').textContent = '';
        $('payoutForm').hidden = true;
        $('payoutSaved').hidden = true;
        $('nameForm').hidden = true;
        $('turnstileHint').hidden = true;
        this.overBounty(info.bounty || null);
        this.cloutReceipt(info.banked || null, sounds);
        const badges = info.badges || [];
        $('overBadges').hidden = !badges.length;
        $('overBadges').textContent = badges.length
            ? `NEW ${badges.length > 1 ? 'BADGES' : 'BADGE'}: ${badges.map((b) => b.name.toUpperCase()).join(' · ')}`
            : '';
        this.overNote('');
        this.show('screenOver');
        this.announce(`${title}. Score ${fmtNum(summary.score)}.`);
    }

    setRank(text) {
        $('overRank').textContent = text;
    }

    overNote(text, tone = '') {
        const el = $('overNote');
        el.textContent = text;
        el.className = `over-note ${tone}`;
    }

    /** Turnstile wants a tap: point at the box. */
    botCheckHint(on) {
        $('turnstileHint').hidden = !on;
    }

    askName(current, onSubmit) {
        const form = $('nameForm');
        const input = $('nameInput');
        input.value = current || '';
        form.hidden = false;
        form.onsubmit = (e) => {
            e.preventDefault();
            input.blur();
            form.hidden = true;
            onSubmit(input.value);
        };
    }

    /** The prize-address form. `label` says whether today's prize is live. */
    askPayout(current, label, onSubmit) {
        const form = $('payoutForm');
        const input = $('payoutInput');
        input.value = current || '';
        $('payoutLabel').textContent = label;
        $('payoutSaved').hidden = true;
        form.hidden = false;
        form.onsubmit = (e) => {
            e.preventDefault();
            onSubmit(input.value.trim());
        };
    }

    /** A saved address, shortened, with a way to change it. */
    payoutSaved(address, onChange) {
        $('payoutForm').hidden = true;
        $('payoutSavedAddr').textContent = `${address.slice(0, 4)}…${address.slice(-4)}`;
        $('payoutSaved').hidden = false;
        $('btnPayoutChange').onclick = onChange;
    }

    payoutNote(text, tone = '') {
        const el = $('payoutNote');
        el.textContent = text;
        el.className = tone;
    }

    hideNameForm() {
        $('nameForm').hidden = true;
    }

    /**
     * The share screen: the run's card (once it has an id), the text, and the ways out.
     * @param {{text:string, url:string, xUrl:string, cardUrl:string|null, native:boolean}} s
     */
    showShare(s, handlers) {
        const img = $('shareCard');
        if (s.cardUrl) {
            if (img.getAttribute('src') !== s.cardUrl) img.src = s.cardUrl;
            img.hidden = false;
            img.onerror = () => (img.hidden = true);
        } else {
            img.hidden = true;
            img.removeAttribute('src');
        }
        $('shareText').textContent = `${s.text}\n${s.url}`;
        $('btnShareX').href = s.xUrl;
        const save = $('btnShareSave');
        save.hidden = !s.cardUrl;
        if (s.cardUrl) {
            save.href = s.cardUrl;
            save.setAttribute('download', 'bearproof-run.png');
        }
        $('btnShareNative').hidden = !s.native;
        $('btnShareCopy').onclick = handlers.copy;
        $('btnShareNative').onclick = handlers.native;
        $('btnShareX').onclick = handlers.x;
        if ($('screenShare').hidden) {
            this.shareNote('');
            this.show('screenShare');
        }
    }

    shareNote(text, tone = '') {
        const el = $('shareNote');
        el.textContent = text;
        el.className = `share-note ${tone}`;
    }

    showBoard({ title, sub, entries, me }) {
        $('boardTitle').textContent = title;
        $('boardSub').textContent = sub || '';
        const list = $('boardList');
        if (!entries || !entries.length) {
            list.innerHTML = `<li><span class="empty">No runs yet today. Be the first on the board.</span></li>`;
        } else {
            list.innerHTML = entries
                .map(
                    (e) => `<li class="${e.playerIsMe || e.runId === me ? 'me' : ''}">
                        <span class="r">${e.rank}</span>
                        <span class="n">${esc(e.name)}</span>
                        <span class="v ${e.status === 'verified' ? 'ok' : ''}">${e.status === 'verified' ? '✓ verified' : 'pending'}</span>
                        <span class="s">${fmtNum(e.score)}</span></li>`
                )
                .join('');
        }
        this.show('screenBoard');
    }

    showSettings(prefs, onChange) {
        const rows = [
            ['sound', 'Sound', !prefs.muted],
            ['musicEnabled', 'Music', prefs.musicEnabled],
            ['screenShake', 'Screen shake', prefs.screenShake],
            ['damageNumbers', 'Damage numbers', prefs.damageNumbers],
            ['vibration', 'Vibration', prefs.vibration],
            ['reducedMotion', 'Reduced motion', prefs.reducedMotion]
        ];
        const list = $('settingsList');
        list.innerHTML = rows
            .map(
                ([k, label, on]) =>
                    `<label><span>${label}</span><input type="checkbox" data-k="${k}" ${on ? 'checked' : ''}></label>`
            )
            .join('');
        list.querySelectorAll('input').forEach((el) =>
            el.addEventListener('change', () => onChange(el.dataset.k, el.checked))
        );
        this.show('screenSettings');
    }

    /**
     * The Field Guide: one tab per guideSections() entry, each a list of icon, name, what it does and its numbers.
     * Remembers the last tab for the session.
     */
    showGuide(sections, tab = this._guideTab) {
        const current = sections.find((s) => s.id === tab) || sections[0];
        this._guideTab = current.id;
        const tabs = $('guideTabs');
        tabs.innerHTML = '';
        for (const s of sections) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'guide-tab';
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-selected', String(s.id === current.id));
            b.innerHTML = `<span>${esc(s.label.toUpperCase())}</span><small>${s.entries.length}</small>`;
            b.setAttribute('aria-label', `${s.label}, ${s.entries.length}`);
            b.addEventListener('click', () => {
                this.showGuide(sections, s.id);
                $('guideTabs').querySelector('[aria-selected="true"]')?.focus();
            });
            tabs.appendChild(b);
        }
        $('guideIntro').textContent = current.intro || '';
        const list = $('guideList');
        list.innerHTML = '';
        list.dataset.tab = current.id;
        for (const e of current.entries) {
            const li = document.createElement('li');
            li.className =
                'guide-entry' + (e.evolves ? ' evolves' : '') + (e.locked ? ' locked' : '');
            li.innerHTML = `
                <div class="guide-art"><canvas aria-hidden="true"></canvas></div>
                <div class="guide-body">
                    <b class="guide-name">${esc(e.name)}</b>
                    ${e.tags.map((t) => `<span class="guide-tag">${esc(t)}</span>`).join('')}
                    <p class="guide-text">${esc(e.text)}</p>
                    ${e.stats ? `<p class="guide-stats">${esc(e.stats)}</p>` : ''}
                    ${e.extra ? `<p class="guide-extra">${esc(e.extra)}</p>` : ''}
                </div>`;
            paintIcon(
                li.querySelector('canvas'),
                e.art,
                e.scale || (current.id === 'bosses' ? 1 : 2)
            );
            list.appendChild(li);
        }
        list.scrollTop = 0;
        if ($('screenGuide').hidden) this.show('screenGuide');
    }

    setSoundLabel(on) {
        const b = $('btnSound');
        b.classList.toggle('muted', !on);
        b.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
        b.title = on ? 'Sound on' : 'Sound off';
    }
}
