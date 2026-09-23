/**
 * @module ui
 * @description DOM screens and HUD. Pure presentation: it shows what the game tells it and reports clicks
 * back through callbacks. Nothing here touches the simulation directly.
 */

import { ICONS, bakeIcon, bakeSprite } from './art/sprites.js';
import { PASSIVES, WEAPONS } from './sim/content.js';
import { fmtNum, fmtTime } from './format.js';

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
            'screenSettings'
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
            const first =
                $(id).querySelector('.btn-primary') || $(id).querySelector('button, [href], input');
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

    setDailySub(text) {
        $('dailySub').textContent = text;
    }

    setTodayTop(text) {
        $('todayTop').textContent = text || '';
    }

    showOver(info) {
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
        this.show('screenOver');
        this.announce(`${title}. Score ${fmtNum(summary.score)}.`);
    }

    setRank(text) {
        $('overRank').textContent = text;
    }

    askName(current, onSubmit) {
        const form = $('nameForm');
        const input = $('nameInput');
        input.value = current || '';
        form.hidden = false;
        form.onsubmit = (e) => {
            e.preventDefault();
            form.hidden = true;
            onSubmit(input.value);
        };
    }

    askPayout(current, onSubmit) {
        const form = $('payoutForm');
        const input = $('payoutInput');
        input.value = current || '';
        form.hidden = false;
        form.onsubmit = (e) => {
            e.preventDefault();
            onSubmit(input.value.trim());
        };
    }

    payoutNote(text) {
        $('payoutNote').textContent = text;
    }

    hideNameForm() {
        $('nameForm').hidden = true;
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

    setSoundLabel(on) {
        const b = $('btnSound');
        b.classList.toggle('muted', !on);
        b.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
        b.title = on ? 'Sound on' : 'Sound off';
    }
}
