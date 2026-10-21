/**
 * @module ui
 * @description DOM screens and HUD. Pure presentation: it shows what the game tells it and reports clicks
 * back through callbacks. Nothing here touches the simulation directly.
 */

import { ICONS, bakeIcon, bakeSprite } from './art/sprites.js';
import {
    CHARACTERS,
    CHOICE_REROLL,
    CHOICE_SKIP,
    PASSIVES,
    STAGES,
    WEAPONS
} from './sim/content.js';
import { fmtNum, fmtTime } from './format.js';
import { collectionTotals } from './collection.js';
import { ETERNAL_BEAR, MARKET, bearHp, characterUnlocked, levelForXp } from './profile.js';
import {
    MISSIONS,
    MISSION_TABS,
    missionProgress,
    missionRatio,
    missionScope,
    missionTab,
    missionTotals,
    nextMission
} from './missions.js';

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

/** Draw an icon (or sprite) into a canvas element at an integer scale. `locked`: a dark silhouette only. */
export function paintIcon(canvas, id, scale = 4, { locked = false } = {}) {
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
    if (locked) {
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = '#2A3442';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
    }
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
            'screenMarket',
            'screenMissions',
            'screenMaps'
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
            kills: $('hKills'),
            bossbar: $('bossbar'),
            bossName: $('bossName'),
            bossHp: $('bossHp'),
            loadout: $('loadout'),
            halt: $('hHalt'),
            haltVeil: $('haltVeil')
        };
        this._last = {};
        this._toastTimer = 0;
        this._bossTimer = 0;
        this._loadoutKey = '';
        this._chestUntil = 0;
        // Whether the key being handled is an auto-repeat: a held S (moving down) must never press SKIP. This runs
        // before the input layer's own keydown listener (the UI is built first), so levelKey() can read it.
        this._keyRepeat = false;
        globalThis.addEventListener?.('keydown', (e) => (this._keyRepeat = !!e.repeat), true);
        $('btnReroll').addEventListener('click', () => this._levelAct?.(CHOICE_REROLL));
        $('btnSkip').addEventListener('click', () => this._levelAct?.(CHOICE_SKIP));
    }

    show(id, { focus = true } = {}) {
        this.current = id;
        for (const s of this.screens) $(s).hidden = s !== id;
        document.body.classList.toggle('on-title', id === 'screenTitle');
        if (id === 'screenLevel') $('toast').classList.remove('show');
        const inGame = id === null || id === 'screenLevel';
        $('hud').hidden = !(inGame || id === 'screenPause');
        document.body.classList.toggle('no-hud', $('hud').hidden);
        this.hud.loadout.hidden = $('hud').hidden;
        if (id && focus) {
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
        set('kills', sim.stats.kills, (v) => (this.hud.kills.textContent = fmtNum(v)));
        set('wave', sim.wave.label, (v) => (this.hud.wave.textContent = v));
        // Trading Halt: the seconds left under the timer, and a frost edge on the screen; it thaws in the last one
        const haltLeft = (sim.haltUntil || 0) - sim.time;
        set('halt', haltLeft > 0 ? Math.ceil(haltLeft) : 0, (v) => {
            this.hud.halt.hidden = !v;
            this.hud.halt.textContent = v ? `HALT ${v}s` : '';
            this.hud.halt.parentElement.classList.toggle('halted', !!v);
            this.hud.haltVeil.hidden = !v;
            this.hud.haltVeil.classList.toggle('thaw', v === 1);
        });

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
            // evolved: its evolved icon and a star; Lv 5 still waiting on its catalyst shows a plain 5
            for (const w of p.weapons) {
                const evolved = w.isEvolved();
                const icon = evolved && ICONS[`evo_${w.id}`] ? `evo_${w.id}` : w.def.icon;
                this._slot(icon, evolved ? '★' : w.level, false, evolved);
            }
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
        this.hud.halt.hidden = true;
        this.hud.haltVeil.hidden = true;
        this.chestReveal(null);
        clearTimeout(this._toastLater); // a toast held back by the last run's chest banner
    }

    toast(text, tone = 'gold', ms = 1400) {
        // The chest banner owns the middle of the screen for its 2.5 s: a toast waits until it's gone.
        const wait = this._chestUntil - performance.now();
        clearTimeout(this._toastLater);
        if (wait > 0) {
            // (dropped if a screen, say the level-up cards, has opened over the run meanwhile)
            this._toastLater = setTimeout(() => !this.current && this.toast(text, tone, ms), wait);
            return;
        }
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
        this.chestReveal(null);
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
        card.classList.remove('era', 'evo');
        $('bossWarn').textContent = '⚠ BOSS HAS ENTERED THE CHAT';
        this.announce(`Boss incoming: ${name}`);
    }

    /** A weapon evolves: queued, so two evolving on one pick show one after the other. */
    evolveIntro(weaponId) {
        if (!WEAPON_BY_ID[weaponId]) return;
        (this._evoQueue ||= []).push(weaponId);
        if (!this._evoBusy) this._nextEvolve();
    }

    _nextEvolve() {
        const id = this._evoQueue?.shift();
        this._evoBusy = !!id;
        if (!id) return;
        this._showEvolve(id);
        setTimeout(() => this._nextEvolve(), 2000);
    }

    /** The boss card in cyan and gold, with the evolved icon and its recipe. */
    _showEvolve(weaponId) {
        const w = WEAPON_BY_ID[weaponId];
        const cat = PASSIVE_BY_ID[w.evolveWith];
        this.bossIntro(
            w.evolveName,
            `${w.name}${cat ? ` + ${cat.name}` : ''} · ${w.evolveDescription}`,
            ICONS[`evo_${w.id}`] ? `evo_${w.id}` : w.icon
        );
        const card = $('bossCard');
        card.classList.add('evo');
        clearTimeout(this._bossTimer);
        this._bossTimer = setTimeout(() => (card.hidden = true), 1900);
        $('bossWarn').textContent = '★ WEAPON EVOLVED';
        const item = `${w.name.toUpperCase()} EVOLVED INTO ${w.evolveName.toUpperCase()}  ★  NEW COLLECTION ENTRY  ★  BEARS NGMI`;
        $('bossTicker').textContent = `${item}  ·  ${item}`;
        this.announce(`${w.name} evolved into ${w.evolveName}`);
    }

    /** Market Eras: a new era begins. The boss card in the era's colours, with its year and how many bears went. */
    eraIntro(name, year, delisted) {
        this.bossIntro(name, `${year} · ${delisted} bears delisted`, null);
        $('bossCard').classList.add('era');
        $('bossWarn').textContent = '▲ A NEW ERA BEGINS';
        const item = `NEW ERA: ${name.toUpperCase()}  ▲  THE OLD BEARS ARE DELISTED  ▲  NEW BEARS INCOMING`;
        $('bossTicker').textContent = `${item}  ·  ${item}`;
        this.announce(`New era: ${name}`);
    }

    moveHint(on) {
        $('hint').hidden = !on;
    }

    /**
     * A boss's treasure chest opens: a banner above the bull with the 1 or 3 level-ups that came out of it
     * (sim `chest` event items: { kind: 'weapon'|'passive'|'heal', id, level, evolves, amount }), popping in one
     * after another under gold rays. It never takes a tap and never pauses the run; gone in ~2.5 s. `calm` only
     * fades. null hides it.
     */
    chestReveal(items, { calm = false } = {}) {
        const card = $('chestCard');
        clearTimeout(this._chestTimer);
        card.hidden = true;
        this._chestUntil = 0;
        if (!items?.length) return;
        $('toast').classList.remove('show');
        const evolved = items.find((it) => it.evolves);
        const heals = items.every((it) => it.kind === 'heal');
        $('chestTitle').textContent = evolved
            ? 'EVOLVED!'
            : heals
              ? 'TAKE PROFIT'
              : items.length > 1
                ? 'TRIPLE PUMP'
                : 'BAGS PUMPED';
        const list = $('chestItems');
        list.innerHTML = '';
        const said = [];
        const big = !!globalThis.matchMedia?.('(min-width: 900px) and (min-height: 600px)')
            ?.matches;
        items.forEach((it, i) => {
            const def =
                it.kind === 'weapon'
                    ? WEAPON_BY_ID[it.id]
                    : it.kind === 'passive'
                      ? PASSIVE_BY_ID[it.id]
                      : null;
            const name =
                it.evolves && def?.evolveName ? def.evolveName : def?.name || 'Take Profit';
            const tag =
                it.kind === 'heal'
                    ? `+${it.amount || 0} HP`
                    : it.evolves
                      ? 'EVOLVED'
                      : it.kind === 'passive'
                        ? `×${it.level}`
                        : `LV ${it.level}`;
            const li = document.createElement('li');
            li.className = `cr-item ${it.kind}${it.evolves ? ' evo' : ''}`;
            li.style.setProperty('--d', `${260 + i * 220}ms`);
            li.innerHTML = `
                <span class="cr-ic"><canvas aria-hidden="true"></canvas></span>
                <b class="cr-name">${esc(name)}</b>
                <span class="cr-tag">${esc(tag)}</span>`;
            const evoIcon = it.kind === 'weapon' && it.evolves && ICONS[`evo_${it.id}`];
            paintIcon(
                li.querySelector('canvas'),
                evoIcon ? `evo_${it.id}` : def?.icon || 'dca',
                big ? 4 : 3
            );
            list.appendChild(li);
            said.push(`${name} ${tag}`);
        });
        const ms = 2500 + (items.length - 1) * 220;
        card.style.setProperty('--cr-dur', `${ms}ms`);
        card.classList.toggle('calm', !!calm || reduced());
        card.classList.toggle('triple', items.length > 1);
        void card.offsetWidth; // from display:none, so every animation in the banner starts over
        card.hidden = false;
        this._chestUntil = performance.now() + ms;
        this._chestTimer = setTimeout(() => {
            card.hidden = true;
            this._chestUntil = 0;
        }, ms);
        this.announce(`Boss treasure: ${said.join(', ')}.`);
    }

    /**
     * The run's title card: the map's name, its line and, in a Daily, the twist ({ name, description }). It never
     * takes a tap and is gone in ~2.2 s (a bit longer with a twist to read); `calm` only fades. null hides it.
     */
    mapIntro(info) {
        const card = $('mapCard');
        clearTimeout(this._mapTimer);
        card.hidden = true;
        if (!info) return;
        $('mapCardName').textContent = info.name;
        $('mapCardDesc').textContent = info.description || '';
        $('mapCardTwist').hidden = !info.twist;
        $('mapCardTwistName').textContent = info.twist?.name || '';
        $('mapCardTwistDesc').textContent = info.twist?.description || '';
        const ms = info.twist ? 2800 : 2200;
        card.style.setProperty('--mc-dur', `${ms}ms`);
        card.classList.toggle('calm', !!info.calm || reduced());
        void card.offsetWidth; // from display:none, so every animation in the card starts over
        card.hidden = false;
        this._mapTimer = setTimeout(() => (card.hidden = true), ms);
        this.announce(
            `${info.name}. ${info.description || ''}${info.twist ? ` Twist: ${info.twist.name}. ${info.twist.description}` : ''}`
        );
    }

    /**
     * The pause screen: the run so far, then the build (report.js buildSheet): every weapon with its level pips,
     * every passive with its stacks, and the stats as the sim computes them.
     */
    showPause(sheet, { sub, timeMs, level, kills, score }) {
        this.mapIntro(null);
        $('pauseSub').textContent = sub;
        $('pauseTime').textContent = fmtTime(timeMs);
        $('pauseLevel').textContent = level;
        $('pauseKills').textContent = fmtNum(kills);
        $('pauseScore').textContent = fmtNum(score);
        $('bagsSlots').textContent =
            `${sheet.weapons.length}/${sheet.slots.weapons} WEAPONS · ${sheet.passives.length}/${sheet.slots.passives} PASSIVES`;
        const pips = (n, max) =>
            `<span class="pips bag-pips" aria-hidden="true">${Array.from({ length: max }, (_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('')}</span>`;

        const wl = $('bagWeapons');
        wl.innerHTML = '';
        for (const w of sheet.weapons) {
            const li = document.createElement('li');
            li.className = 'bag-w' + (w.evolved ? ' evolved' : '');
            li.innerHTML = `
                <span class="bag-ic"><canvas aria-hidden="true"></canvas></span>
                <span class="bag-txt">
                    <b class="bag-name">${esc(w.name)}</b>
                    ${w.evolved ? `<span class="bag-evo">EVOLVED</span><small class="bag-from">${esc(w.base)}</small>` : `<small class="bag-lv">LV ${w.level}</small>`}
                </span>
                ${pips(w.level, w.max)}`;
            paintIcon(li.querySelector('canvas'), w.icon, 2);
            li.setAttribute(
                'aria-label',
                w.evolved
                    ? `${w.name}, evolved ${w.base}, level ${w.level} of ${w.max}`
                    : `${w.name}, level ${w.level} of ${w.max}`
            );
            wl.appendChild(li);
        }

        const pl = $('bagPassives');
        pl.innerHTML = '';
        pl.hidden = !sheet.passives.length;
        for (const p of sheet.passives) {
            const li = document.createElement('li');
            li.className = 'bag-p' + (p.evolved ? ' evolved' : p.count >= p.max ? ' maxed' : '');
            li.innerHTML = `
                <span class="bag-ic"><canvas aria-hidden="true"></canvas></span>
                <b class="bag-name">${esc(p.name)}</b>
                <span class="bag-n">${p.evolved ? 'EVO' : `×${p.count}`}</span>`;
            paintIcon(li.querySelector('canvas'), p.icon, 2);
            li.setAttribute(
                'aria-label',
                p.evolved
                    ? `${p.name}, evolved ${p.base}, ${p.count} of ${p.max} stacks`
                    : `${p.name}, ${p.count} of ${p.max} stacks`
            );
            pl.appendChild(li);
        }

        $('pauseStats').innerHTML = sheet.stats
            .map(
                (s) =>
                    `<div class="pstat ${s.tone}"><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`
            )
            .join('');
        this.show('screenPause');
        const body = document.querySelector('#screenPause .pause-body');
        body.scrollTop = 0;
        const more = () =>
            body.classList.toggle(
                'more',
                body.scrollTop + body.clientHeight < body.scrollHeight - 4
            );
        body.onscroll = more;
        more();
    }

    /**
     * The damage report on the receipt (report.js rows): biggest source first, a depth bar for its share, DPS
     * over the time it was held. Phones with little height see the top 3 and a toggle. null hides it.
     */
    overReport(report) {
        const box = $('overReport');
        const rows = report?.rows || [];
        box.hidden = !rows.length;
        box.closest('.receipt')?.classList.toggle('has-report', !!rows.length);
        if (!rows.length) return;
        box.classList.remove('open');
        $('dmgTotal').textContent = `${fmtNum(report.total)} DMG`;
        const list = $('dmgRows');
        list.innerHTML = '';
        const top = rows[0].damage;
        rows.forEach((r, i) => {
            const li = document.createElement('li');
            li.className = 'dmg-row' + (i === 0 ? ' top' : '') + (r.evolved ? ' evolved' : '');
            const pct = Math.round(r.share * 100);
            const tag = r.tag
                ? `<small class="dmg-tag">${esc(r.tag)}</small>`
                : r.level
                  ? `<small class="dmg-lv${r.evolved ? ' evo' : ''}">${r.evolved ? 'EVO' : `LV${r.level}`}</small>`
                  : '';
            li.innerHTML = `
                <i class="dmg-bar" style="width:${Math.max(2, (r.damage / top) * 100).toFixed(1)}%"></i>
                <span class="dmg-ic"><canvas aria-hidden="true"></canvas></span>
                <span class="dmg-name"><b>${esc(r.name)}</b>${tag}</span>
                <span class="dmg-v">${fmtNum(r.damage)}</span>
                <span class="dmg-pct">${pct < 1 ? '<1' : pct}%</span>
                <span class="dmg-dps">${r.dps == null ? '—' : fmtNum(r.dps)}</span>`;
            paintIcon(li.querySelector('canvas'), r.icon, r.tag === 'CRATE' ? 1 : 2);
            li.setAttribute(
                'aria-label',
                `${r.name}: ${fmtNum(r.damage)} damage, ${pct} percent${r.dps == null ? '' : `, ${fmtNum(r.dps)} per second`}`
            );
            list.appendChild(li);
        });
        const more = $('dmgMore');
        const extra = rows.length - 3;
        more.hidden = extra <= 0;
        const label = (open) => (open ? 'TOP 3 ▴' : `ALL ${rows.length} ▾`);
        more.textContent = label(false);
        more.setAttribute('aria-expanded', 'false');
        more.onclick = () => {
            const open = box.classList.toggle('open');
            more.textContent = label(open);
            more.setAttribute('aria-expanded', String(open));
        };
    }

    // --- Level-up ------------------------------------------------------------

    /**
     * Render three cards, and REROLL / SKIP while the run has any left. `onPick(i)` fires once, with a card index
     * or CHOICE_REROLL / CHOICE_SKIP. Taps are ignored for a moment so a held thumb can't misfire. `shuffle`: the
     * cards on screen were just rerolled, so the old ones flip away and the new ones are dealt in.
     */
    showLevelUp(
        level,
        choices,
        onPick,
        { rerolls = 0, skips = 0, shuffle = false, calm = false } = {}
    ) {
        $('lvN').textContent = level;
        const wrap = $('cards');
        const gen = (this._lvGen = (this._lvGen || 0) + 1);
        wrap.classList.add('locked');
        let armed = false;
        let done = false;
        const pick = (i) => {
            if (!armed || done) return;
            if (i === CHOICE_REROLL && rerolls <= 0) return;
            if (i === CHOICE_SKIP && skips <= 0) return;
            done = true;
            onPick(i);
        };
        this._levelAct = pick;
        const acts = [
            [$('btnReroll'), $('rerollN'), rerolls, 'Reroll: three new cards'],
            [$('btnSkip'), $('skipN'), skips, 'Skip: take no card']
        ];
        for (const [btn, n, left, label] of acts) {
            btn.hidden = left <= 0;
            n.textContent = `×${left}`;
            btn.setAttribute('aria-label', `${label}, ${left} left`);
        }
        $('lvActs').hidden = rerolls <= 0 && skips <= 0;
        $('lvHint').textContent = [
            'Pick one · keys 1 2 3',
            rerolls > 0 ? 'R reroll' : '',
            skips > 0 ? 'S skip' : ''
        ]
            .filter(Boolean)
            .join(' · ');
        const motion = !calm && !reduced();
        const deal = () => {
            if (gen !== this._lvGen) return;
            wrap.innerHTML = '';
            wrap.classList.toggle('shuffle', shuffle && motion);
            this._dealCards(wrap, choices, pick);
            setTimeout(() => {
                if (gen !== this._lvGen) return;
                armed = true;
                wrap.classList.remove('locked');
            }, 380);
        };
        // A reroll: the three old cards flip away first, then the new three are dealt.
        const old = shuffle && motion ? [...wrap.children] : [];
        if (old.length) {
            for (const c of old) c.classList.add('out');
            setTimeout(deal, 170);
        } else deal();
        if (!shuffle || $('screenLevel').hidden) this.show('screenLevel');
        this._levelKeys = (key, { pad = false } = {}) => {
            const n = Number(key);
            if (n >= 1 && n <= choices.length) return pick(n - 1);
            // R / S: a fresh press only. A key held from running (S is "down") repeats, and must not spend these.
            if (!pad && this._keyRepeat) return;
            if (key === 'r') pick(CHOICE_REROLL);
            else if (key === 's') pick(CHOICE_SKIP);
        };
        this.announce(
            shuffle
                ? `Rerolled. ${rerolls} reroll${rerolls === 1 ? '' : 's'} left.`
                : `Level ${level}. Choose an upgrade.`
        );
    }

    /** The three level-up cards (the buttons inside #cards). */
    _dealCards(wrap, choices, pick) {
        choices.forEach((c, i) => {
            const def =
                c.kind === 'weapon'
                    ? WEAPON_BY_ID[c.id]
                    : c.kind === 'passive'
                      ? PASSIVE_BY_ID[c.id]
                      : null;
            const btn = document.createElement('button');
            // a catalyst card evolves (or will evolve) a weapon the bull holds
            const target = WEAPON_BY_ID[c.evolvesWeapon || c.catalystFor];
            const evolving = c.evolves || !!c.evolvesWeapon;
            btn.className =
                'card' +
                (c.kind === 'passive' ? ' kind-passive' : ' kind-weapon') +
                (evolving ? ' evo' : '') +
                (c.kind === 'heal' ? ' heal' : '');
            btn.setAttribute('role', 'menuitem');
            const name = def ? def.name : 'Take Profit';
            const tag =
                c.kind === 'heal'
                    ? 'HEAL'
                    : evolving
                      ? 'EVOLVES'
                      : c.needs
                        ? 'LV 5'
                        : c.isNew
                          ? c.catalystFor
                              ? 'CATALYST'
                              : 'NEW'
                          : `LV ${c.level - 1} → ${c.level}`;
            const tagCls = evolving ? 'evo' : c.catalystFor ? 'cat' : c.isNew ? 'new' : '';
            const desc = def
                ? def.description
                : `Everything is maxed. Bank it: heal ${c.amount} HP.`;
            const evo = c.evolvesWeapon
                ? `Evolves ${target.name} → ${target.evolveName}: ${target.evolveDescription}`
                : c.catalystFor
                  ? `Catalyst: ${target.name} at Lv ${target.evolveLevel} → ${target.evolveName}`
                  : c.needs
                    ? `Needs ${PASSIVE_BY_ID[c.needs]?.name} to evolve → ${def.evolveName}`
                    : c.evolves && def?.evolveName
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
            // an evolving weapon card shows what it becomes
            paintIcon(
                btn.querySelector('canvas'),
                c.kind === 'weapon' && c.evolves && ICONS[`evo_${c.id}`]
                    ? `evo_${c.id}`
                    : def?.icon || 'dca',
                4
            );
            btn.addEventListener('click', () => pick(i));
            btn.setAttribute('aria-label', `${name}, ${tag}. ${desc} ${evo}`);
            wrap.appendChild(btn);
        });
    }

    /** A key (or a pad button, `{ pad: true }`) on the level-up screen: 1 2 3 pick a card, R rerolls, S skips. */
    levelKey(key, opts) {
        this._levelKeys?.(key, opts);
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

    /** Today's map and twist on the Daily card (hidden until today's challenge is known). */
    setDailyMeta(map, twist) {
        $('dailyMeta').hidden = !map;
        $('dailyMap').textContent = map || '';
        $('dailyTwistName').textContent = twist || '';
    }

    /** The countdown to the next build in the Daily card's corner ('' hides it). */
    setDailyClock(text) {
        $('dailyClock').textContent = text || '';
    }

    /** The detail line on a main-menu row. */
    setMenuMeta(id, text) {
        const el = $(id);
        if (el) el.textContent = text;
    }

    /** The ticker tape under the menu: [{label, value, gold}], run twice so the loop is seamless. */
    setTape(items) {
        const run = $('tape');
        run.textContent = '';
        if (!items.length) return;
        for (let pass = 0; pass < 2; pass++) {
            for (const it of items) {
                const s = document.createElement('span');
                s.append(`${it.label} `);
                const b = document.createElement('b');
                if (it.gold) b.className = 'g';
                b.textContent = it.value;
                s.append(b);
                run.append(s);
            }
        }
        run.style.animationDuration = `${Math.max(30, items.length * 7)}s`;
    }

    /** The title screen's profile strip: player level, its bar and the CLOUT balance; it opens the Market. */
    profileStrip(profile) {
        const lv = levelForXp(profile.xp);
        $('btnProfile').hidden = false;
        $('psLevel').textContent = lv.level;
        $('psXp').textContent = `${fmtNum(lv.into)} / ${fmtNum(lv.need)} XP`;
        $('psBar').style.width = `${Math.round((lv.into / lv.need) * 100)}%`;
        $('psClout').textContent = fmtNum(profile.clout);
        $('miMarket').textContent = `${fmtNum(profile.clout)} CLOUT to spend`;
        const col = collectionTotals(profile.seen);
        $('miGuide').textContent = col.found
            ? `${col.found}/${col.total} found`
            : 'Weapons, evolutions & bears';
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
            if (l.id === 'mission') li.className = 'ms';
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
    showMarket(profile, tab, handlers, { character = 'bull' } = {}) {
        const tabs = [
            [
                'chars',
                'Heroes',
                'New ways to play. The bull and Pepe are free; the rest unlock with CLOUT, Daily included.'
            ],
            ['skins', 'Skins', 'Redrawn looks for your characters. Same hitbox, same stats.'],
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
                current[0] === 'chars'
                    ? i.slot === 'character'
                    : current[0] === 'skins'
                      ? i.slot.startsWith('skin:') && characterUnlocked(profile, i.slot.slice(5)) // no skins for a locked character
                      : i.slot === current[0]
            );
            for (const item of items) {
                const owned = profile.owned.includes(item.id);
                const isChar = item.slot === 'character';
                const on = isChar
                    ? character === item.character
                    : profile.equipped[item.slot] === item.id;
                const li = document.createElement('li');
                li.className = 'guide-entry market-item' + (on ? ' on' : '');
                const who = item.slot.startsWith('skin:')
                    ? CHARACTERS[item.slot.slice(5)]?.name.replace(/^The /, '').toUpperCase()
                    : '';
                const short = !owned && profile.clout < item.price;
                const label = on
                    ? isChar
                        ? 'PLAYING'
                        : 'EQUIPPED'
                    : owned
                      ? isChar
                          ? 'PLAY'
                          : 'EQUIP'
                      : `${fmtNum(item.price)} CLOUT`;
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
                    `${item.name}${who ? ` for ${who}` : ''}: ${on ? label.toLowerCase() : owned ? (isChar ? 'play as' : 'equip') : `buy for ${item.price} CLOUT`}`
                );
                btn.addEventListener('click', () =>
                    !owned
                        ? handlers.buy(item.id, btn)
                        : isChar
                          ? handlers.play(item.character)
                          : handlers.equip(item.id)
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
        this.overReport(info.report || null);
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
        // Graphics: the map's lighting and ambient life (the renderer reads prefs.graphics live).
        const gfx = ['auto', 'high', 'low'].includes(prefs.graphics) ? prefs.graphics : 'auto';
        const seg = [
            ['auto', 'AUTO'],
            ['high', 'HIGH'],
            ['low', 'LOW']
        ];
        list.innerHTML =
            `<div class="set-seg"><span id="gfxLab">Graphics<small>Auto drops to low on a slow device</small></span>
                <span class="seg-pick" role="radiogroup" aria-labelledby="gfxLab">${seg
                    .map(
                        ([v, label]) =>
                            `<button type="button" role="radio" data-v="${v}" aria-checked="${v === gfx}">${label}</button>`
                    )
                    .join('')}</span></div>` +
            rows
                .map(
                    ([k, label, on]) =>
                        `<label><span>${label}</span><input type="checkbox" data-k="${k}" ${on ? 'checked' : ''}></label>`
                )
                .join('');
        list.querySelectorAll('input').forEach((el) =>
            el.addEventListener('change', () => onChange(el.dataset.k, el.checked))
        );
        const opts = [...list.querySelectorAll('.seg-pick button')];
        for (const b of opts)
            b.addEventListener('click', () => {
                for (const o of opts) o.setAttribute('aria-checked', String(o === b));
                onChange('graphics', b.dataset.v);
            });
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
            const count = s.count || String(s.entries.length);
            b.innerHTML = `<span>${esc(s.label.toUpperCase())}</span><small>${esc(count)}</small>`;
            b.setAttribute(
                'aria-label',
                `${s.label}, ${s.count ? `${count.replace('/', ' of ')} found` : count}`
            );
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
                e.scale || (current.id === 'bosses' ? 1 : 2),
                {
                    locked: !!e.silhouette
                }
            );
            list.appendChild(li);
        }
        list.scrollTop = 0;
        if ($('screenGuide').hidden) this.show('screenGuide');
    }

    /**
     * The Missions screen: a tab per MISSION_TABS entry, each mission with its art, goal, best progress and reward.
     * `profile` is a normalized profile; `onTab(id)` re-opens it on another tab.
     */
    showMissions(profile, tab, onTab) {
        const st = profile.missions;
        const tot = missionTotals(st);
        const current = MISSION_TABS.find((t) => t.id === tab) || MISSION_TABS[0];
        $('missionsCount').textContent = `${tot.done} / ${tot.total}`;
        $('missionsLeft').textContent = fmtNum(tot.left);
        const tabs = $('missionsTabs');
        tabs.innerHTML = '';
        for (const t of MISSION_TABS) {
            const list = MISSIONS.filter((m) => missionTab(m) === t.id);
            const done = list.filter((m) => m.id in st.done).length;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'guide-tab';
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-selected', String(t.id === current.id));
            b.innerHTML = `<span>${esc(t.label.toUpperCase())}</span><small>${done}/${list.length}</small>`;
            b.setAttribute('aria-label', `${t.label}, ${done} of ${list.length} done`);
            b.addEventListener('click', () => {
                onTab(t.id);
                $('missionsTabs').querySelector('[aria-selected="true"]')?.focus();
            });
            tabs.appendChild(b);
        }
        const locked = CHARACTERS[current.id] && !characterUnlocked(profile, current.id);
        $('missionsIntro').textContent = locked
            ? `Unlock ${CHARACTERS[current.id].name} in the Market to play for these.`
            : current.id === 'any'
              ? 'Any character, any map, free run or Daily. Each pays once.'
              : current.id === 'maps'
                ? 'Free Run lets you pick the map. The Daily counts too.'
                : `Play as ${CHARACTERS[current.id]?.name || current.label} to work on these.`;
        const list = $('missionsList');
        list.innerHTML = '';
        for (const m of MISSIONS.filter((x) => missionTab(x) === current.id)) {
            const done = m.id in st.done;
            const ratio = missionRatio(st, m);
            const scope = current.id === 'maps' ? missionScope(m) : null;
            const prog = done ? '' : missionProgress(m, st.best[m.id] || 0);
            const li = document.createElement('li');
            li.className =
                'guide-entry mission' + (done ? ' done' : '') + (locked ? ' locked' : '');
            li.innerHTML = `
                <div class="guide-art"><canvas aria-hidden="true"></canvas></div>
                <div class="guide-body">
                    <b class="guide-name">${esc(m.name)}</b>
                    ${scope ? `<span class="guide-tag">${esc(scope.toUpperCase())}</span>` : ''}
                    ${done ? `<span class="guide-tag ms-tag">DONE${st.done[m.id] ? ` ${esc(st.done[m.id])}` : ''}</span>` : ''}
                    <p class="guide-text">${esc(m.text)}</p>
                    ${done || m.unit === 'once' ? '' : `<div class="ms-prog"><span class="bar bar-ms"><i style="width:${Math.round(ratio * 100)}%"></i></span><small>${esc(prog)}</small></div>`}
                </div>
                <span class="ms-reward"><b>${done ? '✓' : `+${fmtNum(m.reward)}`}</b><small>${done ? (st.unpaid.includes(m.id) ? 'NEXT RECEIPT' : 'PAID') : 'CLOUT'}</small></span>`;
            li.setAttribute(
                'aria-label',
                `${m.name}: ${m.text} ${done ? 'Done.' : `${prog ? `${prog}. ` : ''}Pays ${m.reward} CLOUT.`}`
            );
            paintIcon(li.querySelector('canvas'), m.art, m.scale || (ICONS[m.art] ? 2 : 1));
            list.appendChild(li);
        }
        if ($('screenMissions').hidden) {
            list.scrollTop = 0;
            this.show('screenMissions');
        }
    }

    /** The title's Missions menu line and the next mission for the character on show (or nothing when all done). */
    missionStrip(profile, character) {
        const st = profile.missions;
        const tot = missionTotals(st);
        $('miMissions').textContent =
            tot.done === tot.total
                ? 'Every mission done'
                : `${tot.done} of ${tot.total} done · ${fmtNum(tot.left)} CLOUT left`;
        const m = nextMission(st, character);
        const box = $('charMission');
        box.hidden = !m;
        if (!m) return;
        const ratio = missionRatio(st, m);
        $('cmName').textContent = m.text;
        $('cmReward').textContent = `+${fmtNum(m.reward)}`;
        $('cmBar').style.width = `${Math.round(ratio * 100)}%`;
        $('cmProg').textContent =
            m.unit === 'once' ? 'One run, one go' : missionProgress(m, st.best[m.id] || 0);
    }

    setSoundLabel(on) {
        const b = $('btnSound');
        b.classList.toggle('muted', !on);
        b.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
        b.title = on ? 'Sound on' : 'Sound off';
    }
}
