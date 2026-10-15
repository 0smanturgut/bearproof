/**
 * @module murmur-bridge
 * @description The Murmur bridge: lets CrowLab's Murmur page (crowlab.ai/murmur), which shows this build in a
 * frame, ask for a recording of the run when a player presses its "Something's broken" button.
 *
 * Inert unless the page is in a frame AND the URL has `?murmur=1`. Then it answers one kind of request, and only
 * from the parent window at an allowed origin:
 *
 *   parent → game   { type: 'murmur:capture', v: 1, id }
 *   game → parent   { type: 'murmur:capture:result', v: 1, id, ok: true, build, tick, seed, twist, character,
 *                     simVersion, mode, runlog, frames, frameTicks }
 *                   { type: 'murmur:capture:result', v: 1, id, ok: false, reason }
 *
 * `runlog` is the run log up to now (base64url of RunRecorder.toBytes(), the same bytes the server re-simulates),
 * so the run replays from tick 0 on this exact build. `frames` are up to 30 small thumbnails of the game canvas,
 * one per second of play (the last 30 s), oldest first; `frameTicks[i]` is the sim tick of `frames[i]`.
 *
 * It also tells the parent `{ type: 'murmur:ready', v: 1, build }` once, and `{ type: 'murmur:state', v: 1,
 * state }` (title | playing | paused | over) when that changes, so the button is enabled only during a run. A
 * parent that loads late can send `{ type: 'murmur:hello', v: 1 }` to get both again.
 *
 * Murmur tests the game, never a coin, so in its frame the game shows no coin, prize, bounty or wallet UI and
 * no link out to the HQ: the bridge adds `murmur` to <body> with its own style rules (MURMUR_HIDDEN), and drops
 * this build's bounty from the page (`game.bounty`, read only by the UI; the simulation never sees it).
 *
 * No camera, no microphone, no cookies, no storage, no network. Apart from that bounty it reads the game and
 * never changes it, and it does nothing inside the simulation step: thumbnails come from a once-a-second timer.
 *
 * Added by a bootstrap session for CrowLab's Muninn; the Build Agent can't edit it (scripts/guard-paths.mjs).
 */

import { SIM_VERSION } from './sim/sim.js';
import { toBase64Url } from './sim/runlog.js';

export const BRIDGE_VERSION = 1;
/** Origins allowed to ask for a recording: crowlab.ai, Muninn's preview and its local dev servers. */
export const PARENT_ORIGINS = Object.freeze([
    'https://crowlab.ai',
    'https://muninn-preview.osmankng.workers.dev',
    'http://localhost:4322',
    'http://127.0.0.1:8788'
]);
/**
 * The game's coin, prize, bounty and wallet UI, and its links out to the HQ (which shows the coin): hidden in the
 * Murmur frame. game/test/murmur-bridge.test.js checks every id still exists in index.html.
 */
export const MURMUR_HIDDEN = Object.freeze([
    '#dailyBounty', // the AI bounty on the title card, paid in a coin
    '#hBounty', // its HUD chip
    '#overBountyRow', // its row on the receipt
    '#overBountyNote',
    '#turnstileHint', // "… so this run can win today's prize"
    '#overRank', // can end in "not prize-eligible"
    '#payoutForm', // the prize address prompt
    '#payoutSaved',
    '.chip', // links to the HQ
    '.title-foot',
    '#btnHome'
]);
export const MURMUR_CSS = `${MURMUR_HIDDEN.map((sel) => `body.murmur ${sel}`).join(',\n')} {
    display: none !important;
}
`;
export const MAX_FRAMES = 30;
export const FRAME_WIDTH = 240;
const FRAME_QUALITY = 0.5;
const STATE_POLL_MS = 250;
const FRAME_EVERY_MS = 1000;

/** True when this page is in a frame and was opened with `?murmur=1`. */
export function bridgeWanted(win) {
    let framed;
    try {
        framed = win.self !== win.top;
    } catch {
        framed = true; // reading top can throw in some sandboxes; that only happens in a frame
    }
    if (!framed) return false;
    try {
        return new URLSearchParams(win.location.search).get('murmur') === '1';
    } catch {
        return false;
    }
}

/** The game's internal state as the four the parent needs. The autopilot behind the title is "title". */
export function publicState(game) {
    if (!game || game.attract) return 'title';
    if (game.state === 'playing' || game.state === 'levelup') return 'playing';
    if (game.state === 'paused') return 'paused';
    if (game.state === 'over') return 'over';
    return 'title';
}

/** A fixed-size ring of the newest frames. */
export class FrameRing {
    constructor(cap = MAX_FRAMES) {
        this.cap = cap;
        this.items = [];
    }
    push(item) {
        this.items.push(item);
        if (this.items.length > this.cap) this.items.splice(0, this.items.length - this.cap);
    }
    clear() {
        this.items.length = 0;
    }
    get size() {
        return this.items.length;
    }
    list() {
        return this.items.slice();
    }
}

function parentOriginGuess(win, origins) {
    let o = null;
    try {
        const anc = win.location.ancestorOrigins;
        if (anc && anc.length) o = anc[0];
    } catch {
        /* not available in every browser */
    }
    if (!o) {
        try {
            o = win.document.referrer ? new URL(win.document.referrer).origin : null;
        } catch {
            o = null;
        }
    }
    return o && origins.includes(o) ? o : null;
}

/**
 * The bridge itself, with everything it touches passed in (tests drive it without a browser). `install` adds
 * the listener and timers; `handle`, `poll` and `sampleFrame` are what they call.
 */
export function createMurmurBridge({
    win,
    game,
    build,
    canvas = null,
    origins = PARENT_ORIGINS,
    makeCanvas = () => win.document.createElement('canvas')
}) {
    const frames = new FrameRing(MAX_FRAMES);
    const buildN = build && build.n != null ? build.n : null;
    let parentOrigin = parentOriginGuess(win, origins);
    let lastState = null;
    let lastRec = null;
    let thumb = null;
    const timers = [];

    const post = (msg, origin = parentOrigin) => {
        if (!origin) return;
        try {
            win.parent.postMessage(msg, origin);
        } catch {
            /* the parent went away */
        }
    };
    const stateMsg = () => ({ type: 'murmur:state', v: BRIDGE_VERSION, state: publicState(game) });
    const readyMsg = () => ({ type: 'murmur:ready', v: BRIDGE_VERSION, build: buildN });

    /** A new run starts a new recording: frames from the run before don't belong to it. */
    const followRun = () => {
        if (game.rec !== lastRec) {
            lastRec = game.rec;
            frames.clear();
        }
    };

    function capture(id) {
        followRun();
        if (publicState(game) === 'title' || !game.rec || !game.sim)
            return { ok: false, reason: 'no_run' };
        const sim = game.sim;
        const list = frames.list();
        return {
            ok: true,
            build: buildN,
            tick: sim.tick,
            seed: sim.seed >>> 0,
            twist: sim.twistId || 'none',
            character: sim.characterId || 'bull',
            simVersion: SIM_VERSION,
            mode: game.mode === 'daily' ? 'daily' : 'free',
            runlog: toBase64Url(game.rec.toBytes()),
            frames: list.map((f) => f.url),
            frameTicks: list.map((f) => f.tick),
            id
        };
    }

    function handle(event) {
        if (!event || !origins.includes(event.origin)) return;
        if (event.source !== win.parent) return;
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'murmur:hello') {
            parentOrigin = event.origin;
            post(readyMsg());
            post(stateMsg());
            return;
        }
        if (msg.type !== 'murmur:capture') return;
        parentOrigin = event.origin;
        const id = msg.id;
        const goodId =
            (typeof id === 'string' && id.length <= 128) ||
            (typeof id === 'number' && Number.isFinite(id));
        const head = { type: 'murmur:capture:result', v: BRIDGE_VERSION, id: goodId ? id : null };
        let body;
        if (msg.v !== BRIDGE_VERSION) body = { ok: false, reason: 'unsupported_version' };
        else if (!goodId) body = { ok: false, reason: 'bad_request' };
        else {
            try {
                body = capture(id);
            } catch {
                body = { ok: false, reason: 'capture_failed' };
            }
        }
        post({ ...head, ...body }, event.origin);
    }

    /** State changes for the parent's button. Cheap: one comparison. */
    function poll() {
        followRun();
        // main.js loads the build's bounty after boot; inside Murmur nothing about it is shown.
        if (game.bounty) game.bounty = null;
        const s = publicState(game);
        if (s === lastState) return;
        lastState = s;
        post(stateMsg());
    }

    /** One thumbnail of the canvas, only while a run is being played. Called once a second by a timer. */
    function sampleFrame() {
        followRun();
        const src = canvas || (game.renderer && game.renderer.canvas);
        if (!src || game.attract || game.state !== 'playing' || !game.sim) return;
        if (!src.width || !src.height) return;
        try {
            if (!thumb) thumb = makeCanvas();
            const w = FRAME_WIDTH;
            const h = Math.max(1, Math.round((src.height / src.width) * w));
            if (thumb.width !== w || thumb.height !== h) {
                thumb.width = w;
                thumb.height = h;
            }
            const ctx = thumb.getContext('2d');
            ctx.drawImage(src, 0, 0, w, h);
            let url = thumb.toDataURL('image/webp', FRAME_QUALITY);
            if (!/^data:image\/webp/.test(url)) url = thumb.toDataURL('image/jpeg', FRAME_QUALITY);
            frames.push({ url, tick: game.sim.tick });
        } catch {
            /* a tainted or lost canvas: skip this second */
        }
    }

    /** Murmur mode: no coin, prize, bounty or wallet UI, no link out of the frame to the HQ. */
    function hideCoinUi() {
        const doc = win.document;
        if (doc.head && !doc.getElementById('murmurStyle')) {
            const style = doc.createElement('style');
            style.id = 'murmurStyle';
            style.textContent = MURMUR_CSS;
            doc.head.append(style);
        }
        if (doc.body) doc.body.classList.add('murmur');
    }

    function install() {
        hideCoinUi();
        win.addEventListener('message', handle);
        timers.push(win.setInterval(poll, STATE_POLL_MS));
        timers.push(win.setInterval(sampleFrame, FRAME_EVERY_MS));
        post(readyMsg());
        poll();
    }

    function stop() {
        win.removeEventListener('message', handle);
        for (const t of timers.splice(0)) win.clearInterval(t);
    }

    return { handle, poll, sampleFrame, capture, hideCoinUi, install, stop, frames };
}

/**
 * Wire the bridge into the running game. Does nothing (and returns null) unless the page is framed with
 * `?murmur=1`, so bearproof.app played directly is unchanged.
 */
export function installMurmurBridge(game, build, win = window) {
    if (!bridgeWanted(win)) return null;
    const bridge = createMurmurBridge({ win, game, build });
    bridge.install();
    return bridge;
}
