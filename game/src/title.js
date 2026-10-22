/**
 * @module title
 * @description The main menu's moving parts: the character showcase (a sprite on a lit pedestal, browsed
 * with arrows, keys or a pad), the Free Run map picker with a painted preview of each map, and keyboard /
 * gamepad focus for the menu. Display only: the Simulation reads the character and the map from the run log.
 *
 * Everything here is data-driven. A new CHARACTERS entry shows up in the showcase, a new map in
 * STAGE_ROTATION (with a THEMES entry) shows up in the picker, and a new menu row only needs its button.
 */

import { SPRITES, bakeGlow, bakeSprite } from './art/sprites.js';
import { THEMES } from './art/stages.js';
import { fmtNum } from './format.js';
import { paintIcon } from './ui.js';
import { paintScene } from './world.js';
import { characterUnlocked, normalizeProfile, skinSprite, unlockItem } from './profile.js';
import {
    CHARACTERS,
    CHARACTER_IDS,
    ENEMIES,
    SIM,
    STAGE_ROTATION,
    WEAPONS,
    bossesFor,
    getStage
} from './sim/content.js';

const $ = (id) => document.getElementById(id);
const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
const WEAPON_BY_ID = Object.fromEntries(Object.values(WEAPONS).map((d) => [d.id, d]));
const ENEMY_BY_ID = Object.fromEntries(Object.values(ENEMIES).map((d) => [d.id, d]));
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Ten-segment bars for the showcase: HP against 125, speed against 1.43x (both a little above the best). */
const segments = (v, full) => Math.max(1, Math.min(10, Math.round((v / full) * 10)));

// --- Character showcase ------------------------------------------------------------------------------

/**
 * The showcase. `view` is the character on show; `prefs.character` the one you play. Showing an unlocked
 * character picks it; a locked one stays on show with its price until you unlock it in the Market.
 * `onRender(view)` runs after every render (the next mission follows the character on show).
 * Returns { step(dir), refresh() }.
 */
export function setupShowcase({ prefs, persist, audio, onUnlock, onRender = () => {} }) {
    const profile = () => normalizeProfile(prefs.profile);
    const unlocked = (id) => characterUnlocked(profile(), id);
    if (!CHARACTERS[prefs.character] || !unlocked(prefs.character)) prefs.character = 'bull';
    let view = prefs.character;
    const card = document.querySelector('.show-card');

    const dots = CHARACTER_IDS.map((id) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'char-dot';
        b.dataset.char = id;
        b.setAttribute('role', 'radio');
        b.addEventListener('click', () => show(id, CHARACTER_IDS.indexOf(id) < index() ? -1 : 1));
        $('charPick').append(b);
        return b;
    });
    const fill = (el, n, kind) => {
        el.className = `seg ${kind}`;
        el.textContent = '';
        for (let i = 0; i < 10; i++) {
            const s = document.createElement('i');
            if (i < n) s.className = 'on';
            el.append(s);
        }
    };
    const index = () => CHARACTER_IDS.indexOf(view);

    const render = () => {
        const c = CHARACTERS[view];
        const open = unlocked(view);
        const hp = c.maxHp ?? SIM.PLAYER_HP;
        const speed = c.speedMult ?? 1;
        const weapon = WEAPON_BY_ID[c.starterWeapon] || WEAPON_BY_ID.horns;
        $('charIdx').textContent = `${index() + 1} / ${CHARACTER_IDS.length}`;
        $('charName').textContent = c.name.toUpperCase();
        card.classList.toggle('is-locked', !open);
        $('tagline').textContent = open
            ? c.tagline
            : `Unlock in the Market for ${fmtNum(unlockItem(view).price)} CLOUT. Until then you play as ${CHARACTERS[prefs.character].name}.`;
        fill($('statHp'), segments(hp, 125), 'hp');
        fill($('statSpd'), segments(speed, 1.43), 'spd');
        $('statHpV').textContent = String(hp);
        $('statSpdV').textContent = `${Math.round(speed * 100)}%`;
        paintIcon($('charWeaponIc'), weapon.icon, 2);
        $('charWeapon').textContent = weapon.name;
        $('charWeaponD').textContent = weapon.description;
        const trait = $('charTrait');
        trait.hidden = !c.trait;
        trait.textContent = '';
        if (c.trait) {
            const [name, ...rest] = c.trait.split(': ');
            const b = document.createElement('b');
            b.textContent = rest.length ? name : 'TRAIT';
            trait.append(b, rest.length ? rest.join(': ') : c.trait);
        }
        $('charLock').hidden = open;
        $('charUnlock').hidden = open;
        if (!open) {
            const price = unlockItem(view).price;
            const have = profile().clout;
            $('charUnlockSub').textContent =
                have >= price
                    ? `${fmtNum(price)} CLOUT · you have ${fmtNum(have)}`
                    : `${fmtNum(price)} CLOUT · ${fmtNum(price - have)} more to go`;
        }
        dots.forEach((d) => {
            const id = d.dataset.char;
            d.classList.toggle('locked', !unlocked(id));
            d.setAttribute('aria-checked', String(id === prefs.character));
            d.setAttribute('aria-current', String(id === view));
            d.setAttribute(
                'aria-label',
                unlocked(id)
                    ? `${CHARACTERS[id].name}: ${CHARACTERS[id].description}`
                    : `${CHARACTERS[id].name}: locked, ${unlockItem(id).price} CLOUT in the Market`
            );
        });
        stage.set(view, open, dir);
        onRender(view);
    };

    let dir = 0;
    const show = (id, d = 1) => {
        if (id === view) return;
        dir = d;
        view = id;
        if (unlocked(id)) {
            prefs.character = id;
            persist();
        }
        audio.unlock();
        audio.menuSwap();
        render();
    };
    const step = (d) => {
        const n = CHARACTER_IDS.length;
        show(CHARACTER_IDS[(index() + d + n) % n], d);
    };
    // Swipe the stage to browse, or tap it for the next one.
    const stageEl = document.querySelector('.show-stage');
    let downX = null;
    stageEl.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('button')) downX = e.clientX;
    });
    stageEl.addEventListener('pointerup', (e) => {
        if (downX === null) return;
        const dx = e.clientX - downX;
        downX = null;
        if (Math.abs(dx) > 30) step(dx < 0 ? 1 : -1);
        else if (Math.abs(dx) < 8) step(1);
    });
    stageEl.addEventListener('pointercancel', () => (downX = null));
    $('charPrev').addEventListener('click', () => step(-1));
    $('charNext').addEventListener('click', () => step(1));
    $('charUnlock').addEventListener('click', () => onUnlock(view));

    const stage = pedestal($('titleBull'), (id, open) =>
        open ? skinSprite(profile(), id) || CHARACTERS[id].sprite : CHARACTERS[id].sprite
    );
    render();
    return {
        step,
        /** After the Market: a new unlock or skin. Snaps back to the character you play. */
        refresh() {
            view = prefs.character;
            dir = 0;
            render();
        }
    };
}

const solids = new WeakMap();
/** A frame as one flat colour (every opaque pixel), cached per frame. */
function solid(img, color) {
    let c = solids.get(img);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    solids.set(img, c);
    return c;
}

/**
 * The pedestal: a spotlight, a pixel plinth, motes rising off it and the character bobbing on top. Locked
 * characters stand as a dark silhouette. Swapping slides the old one out and the new one in.
 */
function pedestal(canvas, spriteFor) {
    const ctx = canvas.getContext('2d');
    let cur = null; // {id, open}
    let prev = null;
    let swapAt = 0;
    let swapDir = 1;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const motes = [];
    let lastT = 0;
    let lastMote = 0;

    const fit = () => {
        dpr = Math.min(2, globalThis.devicePixelRatio || 1);
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const W = Math.round(r.width * dpr);
        const H = Math.round(r.height * dpr);
        if (W !== canvas.width || H !== canvas.height) {
            canvas.width = W;
            canvas.height = H;
        }
        w = W;
        h = H;
        return true;
    };
    // The sprite's pixel scale: as big as fits in ~46% of the stage's height, in whole pixels.
    const scaleFor = (id) => {
        const base = bakeSprite(id, 1)?.[0];
        if (!base) return 2;
        return Math.max(2, Math.floor(Math.min((h * 0.42) / base.height, (w * 0.48) / base.width)));
    };

    const drawChar = (who, t, x, alpha) => {
        if (!who) return;
        const id = spriteFor(who.id, who.open) || 'bull';
        const s = scaleFor(id);
        const frames = who.open
            ? bakeSprite(id, s)
            : bakeSprite(id, s, { tint: '#0b1018' }) || bakeSprite(id, s);
        if (!frames?.length) return;
        const still = reduced();
        const img = frames[still ? 0 : Math.floor(t * 8) % frames.length];
        const bob = still ? 0 : Math.round(Math.sin(t * 3.2) * s * 1.2);
        const baseY = Math.round(h * 0.74);
        const dx = Math.round(x - img.width / 2);
        const dy = baseY - img.height + bob - s * 2;
        ctx.globalAlpha = alpha;
        if (!who.open) {
            // a gold outline around the silhouette: a solid gold copy, one sprite pixel out on each side
            const rim = solid(img, '#ffc53d');
            ctx.globalAlpha = alpha * 0.9;
            for (const [ox, oy] of [
                [-s, 0],
                [s, 0],
                [0, -s],
                [0, s]
            ])
                ctx.drawImage(rim, dx + ox, dy + oy);
            ctx.globalAlpha = alpha;
        }
        if (who.open) {
            const glow = bakeGlow(id, s);
            if (glow?.length) {
                ctx.globalCompositeOperation = 'lighter';
                ctx.drawImage(glow[Math.floor(t * 8) % glow.length], dx - glow.pad, dy - glow.pad);
                ctx.globalCompositeOperation = 'source-over';
            }
        }
        ctx.drawImage(img, dx, dy);
        ctx.globalAlpha = 1;
    };

    const draw = (now) => {
        requestAnimationFrame(draw);
        if (canvas.offsetParent === null || document.hidden || !cur) return;
        if (!fit()) return;
        const t = now / 1000;
        const dt = Math.min(0.05, Math.max(0, t - (lastT || t)));
        lastT = t;
        const still = reduced();
        const gold = !cur.open;
        const cx = w / 2;
        const baseY = Math.round(h * 0.74);
        const u = Math.max(2, Math.round(h / 90)); // one "pixel" of the plinth
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, w, h);
        // a pool of shade, so the live build behind the menu never walks across the stage
        const shade = ctx.createRadialGradient(
            cx,
            h * 0.55,
            4,
            cx,
            h * 0.55,
            Math.max(w, h) * 0.55
        );
        shade.addColorStop(0, 'rgba(6,8,11,0.96)');
        shade.addColorStop(0.7, 'rgba(6,8,11,0.82)');
        shade.addColorStop(1, 'rgba(6,8,11,0)');
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, w, h);

        // spotlight from above
        const beam = ctx.createLinearGradient(0, 0, 0, baseY);
        beam.addColorStop(0, gold ? 'rgba(255,197,61,0.0)' : 'rgba(22,224,138,0.0)');
        beam.addColorStop(1, gold ? 'rgba(255,197,61,0.13)' : 'rgba(22,224,138,0.15)');
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.06, 0);
        ctx.lineTo(cx + w * 0.06, 0);
        ctx.lineTo(cx + w * 0.3, baseY);
        ctx.lineTo(cx - w * 0.3, baseY);
        ctx.closePath();
        ctx.fill();
        // floor glow
        // floor glow: a flat ellipse, painted over the whole canvas so it has no edge
        ctx.save();
        ctx.translate(cx, baseY);
        ctx.scale(1, 0.34);
        const floor = ctx.createRadialGradient(0, 0, 2, 0, 0, w * 0.45);
        floor.addColorStop(0, gold ? 'rgba(255,197,61,0.3)' : 'rgba(22,224,138,0.32)');
        floor.addColorStop(1, 'rgba(22,224,138,0)');
        ctx.fillStyle = floor;
        ctx.fillRect(-w, -h * 3, w * 2, h * 6);
        ctx.restore();

        // the plinth: a stepped top face with a lit rim, a darker front with a ticker stripe
        const pw = Math.round(Math.min(w * 0.62, h * 0.9) / u) * u;
        const x0 = Math.round(cx - pw / 2);
        const rim = gold ? '#ffc53d' : '#16e08a';
        ctx.fillStyle = '#121923';
        ctx.fillRect(x0 + u * 2, baseY - u * 3, pw - u * 4, u * 3);
        ctx.fillRect(x0, baseY - u * 2, pw, u * 2);
        ctx.fillStyle = rim;
        ctx.fillRect(x0 + u * 2, baseY - u * 3, pw - u * 4, u);
        ctx.fillRect(x0, baseY - u * 2, u * 2, u);
        ctx.fillRect(x0 + pw - u * 2, baseY - u * 2, u * 2, u);
        ctx.fillStyle = '#0a0e13';
        ctx.fillRect(x0, baseY, pw, u * 5);
        ctx.fillRect(x0 + u, baseY + u * 5, pw - u * 2, u);
        ctx.fillStyle = gold ? 'rgba(255,197,61,0.35)' : 'rgba(22,224,138,0.35)';
        const stripe = still ? 0 : Math.floor(t * 12) % (u * 6);
        for (let x = x0 + u * 2 - stripe; x < x0 + pw - u * 2; x += u * 6) {
            if (x >= x0 + u * 2) ctx.fillRect(x, baseY + u * 2, u * 3, u);
        }

        // motes rising off the plinth
        if (!still) {
            if (t - lastMote > 0.07) {
                lastMote = t;
                motes.push({
                    x: x0 + u * 3 + Math.random() * (pw - u * 6),
                    y: baseY - u * 3,
                    v: (20 + Math.random() * 40) * dpr,
                    life: 1,
                    s: Math.random() < 0.3 ? 2 : 1
                });
            }
            ctx.fillStyle = rim;
            for (let i = motes.length - 1; i >= 0; i--) {
                const m = motes[i];
                m.y -= m.v * dt;
                m.life -= dt * 0.6;
                if (m.life <= 0) {
                    motes.splice(i, 1);
                    continue;
                }
                ctx.globalAlpha = Math.min(1, m.life) * 0.7;
                ctx.fillRect(Math.round(m.x), Math.round(m.y), u * m.s, u * m.s);
            }
            ctx.globalAlpha = 1;
        }

        // the character (and the one leaving, during a swap)
        const k = still ? 1 : Math.min(1, (now - swapAt) / 260);
        const ease = 1 - (1 - k) ** 3;
        const slide = w * 0.32;
        if (prev && k < 1) drawChar(prev, t, cx - swapDir * slide * ease, 1 - ease);
        drawChar(cur, t, cx + swapDir * slide * (1 - ease), prev ? ease : 1);
        if (k >= 1) prev = null;
        // a flash on the rim when a new character lands
        if (!still && k < 1) {
            ctx.globalAlpha = (1 - k) * 0.5;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x0 + u * 2, baseY - u * 3, pw - u * 4, u);
            ctx.globalAlpha = 1;
        }
    };
    requestAnimationFrame(draw);

    return {
        set(id, open, dir) {
            const next = { id, open };
            if (cur && dir && (cur.id !== id || cur.open !== open)) {
                prev = cur;
                swapAt = performance.now();
                swapDir = dir;
            }
            cur = next;
        }
    };
}

// --- Map picker (Free Run) ------------------------------------------------------------------------

/**
 * The Free Run picker: one card per map in the rotation, a painted preview, its first boss, and today's
 * Daily map marked. Picking a card puts the live backdrop on that map. Returns { open(dailyStage), move(d), go() }.
 */
export function setupMapPicker({ prefs, persist, audio, onPreview, onStart }) {
    const list = $('mapList');
    let pick = STAGE_ROTATION.includes(prefs.freeStage) ? prefs.freeStage : STAGE_ROTATION[0];
    let dailyStage = null;
    const cards = STAGE_ROTATION.map((id) => {
        const st = getStage(id);
        const boss = bossesFor(id)[0];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'map-card';
        b.dataset.stage = id;
        b.setAttribute('role', 'radio');
        const cv = document.createElement('canvas');
        cv.className = 'map-cv';
        cv.width = 320;
        cv.height = 180;
        cv.setAttribute('aria-hidden', 'true');
        const flag = document.createElement('span');
        flag.className = 'map-pick';
        flag.textContent = 'SELECTED';
        const body = document.createElement('span');
        body.className = 'map-body';
        const name = document.createElement('span');
        name.className = 'map-name';
        name.textContent = st.name.toUpperCase();
        const desc = document.createElement('span');
        desc.className = 'map-desc';
        desc.textContent = st.description;
        const tags = document.createElement('span');
        tags.className = 'map-tags';
        if (boss) {
            const t = document.createElement('span');
            t.className = 'map-tag';
            t.textContent = `FIRST BOSS ${boss.name.toUpperCase()} · ${clock(boss.spawnAt)}`;
            tags.append(t);
        }
        const today = document.createElement('span');
        today.className = 'map-tag today';
        today.textContent = "TODAY'S DAILY MAP";
        today.hidden = true;
        tags.append(today);
        b._today = today;
        body.append(name, desc, tags);
        b.append(cv, flag, body);
        b._cv = cv;
        b.addEventListener('click', () => {
            if (pick === id) return onStart(id);
            select(id);
        });
        list.append(b);
        return b;
    });
    const next = document.createElement('a');
    next.className = 'map-next';
    next.href = '/#vote';
    next.target = '_top';
    const nb = document.createElement('b');
    nb.textContent = 'WANT A NEW MAP?';
    const ns = document.createElement('span');
    ns.textContent = 'Every night the AI builds what players vote for. Vote on tonight’s build →';
    next.append(nb, ns);
    list.append(next);

    const render = () => {
        for (const c of cards) {
            c.setAttribute('aria-checked', String(c.dataset.stage === pick));
            c._today.hidden = c.dataset.stage !== dailyStage;
        }
        $('mapGoSub').textContent = getStage(pick).name;
    };
    const select = (id, { preview = true } = {}) => {
        audio.unlock();
        if (id !== pick) audio.menuSwap();
        pick = id;
        prefs.freeStage = id;
        persist();
        render();
        if (preview) onPreview(id);
    };
    $('btnMapGo').addEventListener('click', () => onStart(pick));
    return {
        open(daily) {
            // the card art is painted the first time the picker opens, not at boot
            for (const c of cards) {
                if (c._cv) paintMap(c._cv, c.dataset.stage);
                c._cv = null;
            }
            dailyStage = daily || null;
            render();
            onPreview(pick);
            cards.find((c) => c.dataset.stage === pick)?.focus({ preventScroll: true });
        },
        move(d) {
            const i = STAGE_ROTATION.indexOf(pick);
            const n = STAGE_ROTATION.length;
            select(STAGE_ROTATION[(i + d + n) % n]);
            cards.find((c) => c.dataset.stage === pick)?.focus({ preventScroll: true });
        },
        go: () => onStart(pick),
        get pick() {
            return pick;
        }
    };
}

// Where each map's card looks: a corner of its starting scene (world.js lays it out the same for any seed).
const PREVIEW_AT = {
    chop: [-60, 20],
    bear_trap: [10, -120],
    winter: [0, -20],
    eras: [-30, -90],
    pool: [-20, -90]
};

/**
 * A map's card art: a still of the map itself at night (world.js: its ground, scenery and lights), with the
 * bears it leans on closing in on the bull and its first boss waiting on the right, from the stage's own data.
 */
export function paintMap(canvas, id) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.imageSmoothingEnabled = false;
    const [ax, ay] = PREVIEW_AT[id] || [0, 0];
    // the bears this map leans on (its heaviest spawn weights), its first boss, and you
    const st = getStage(id);
    const heavy = Object.entries(st.poolWeights)
        .sort((a, b) => b[1] - a[1])
        .map(([e]) => ENEMY_BY_ID[e]?.sprite)
        .filter(Boolean);
    const mobs = (heavy.length ? heavy : ['red_candle', 'paper_hands', 'bag_holder']).slice(0, 3);
    const extra = [{ id: 'bull', x: ax - 70, y: ay + 22, light: true }];
    [
        [-140, -10],
        [-120, 70],
        [-10, 64],
        [-18, -40]
    ].forEach(([dx, dy], i) =>
        extra.push({ id: mobs[i % mobs.length], x: ax + dx, y: ay + dy, flip: dx > -70 })
    );
    const boss = bossesFor(id)[0];
    if (boss?.sprite) {
        const big = SPRITES[boss.sprite];
        const s = big ? Math.max(1, Math.min(2, Math.floor((H * 0.62) / big.h))) : 2;
        extra.push({ id: boss.sprite, x: ax + 92, y: ay + 40, flip: true, scale: s });
    }
    paintScene(ctx, W, H, { stage: id, at: [ax, ay], extra });
    const th = THEMES[id] || THEMES.chop;
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, th.vignette);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
}

// --- Menu focus ------------------------------------------------------------------------------------

/** Move keyboard focus through a screen's menu buttons (wrapping). Returns true when it moved. */
export function moveFocus(ids, dir) {
    const items = ids.map($).filter((el) => el && el.offsetParent !== null);
    if (!items.length) return false;
    const i = items.indexOf(document.activeElement);
    const next = i < 0 ? (dir > 0 ? 0 : items.length - 1) : (i + dir + items.length) % items.length;
    items[next].focus({ preventScroll: false });
    return true;
}
