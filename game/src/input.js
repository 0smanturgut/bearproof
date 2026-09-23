/**
 * @module input
 * @description Keyboard (remappable, see keymap.js), gamepad and a floating touch joystick, merged into
 * one move vector with |v| ≤ 1. The joystick appears wherever the thumb lands, which is what makes the
 * game playable one-handed on a phone. Upstream had a fixed joystick in the corner.
 *
 * The move vector is quantised to a code (sim/input-codes.js) before it reaches the simulation.
 */

import { DEFAULT_KEYMAP, cloneKeymap } from './keymap.js';

const JOY_RADIUS = 56; // CSS px of thumb travel for full speed
const JOY_DEADZONE = 0.14;
const PAD_DEADZONE = 0.18;

export const GAMEPAD_BUTTON = Object.freeze({
    A: 0,
    B: 1,
    X: 2,
    Y: 3,
    LB: 4,
    RB: 5,
    BACK: 8,
    START: 9
});

export function applyGamepadDeadzone(v, dz = PAD_DEADZONE) {
    if (!Number.isFinite(v)) return 0;
    const a = Math.abs(v);
    if (a < dz) return 0;
    return (v < 0 ? -1 : 1) * ((a - dz) / (1 - dz));
}

/** Map a thumb offset (CSS px) to a move vector: deadzone, then a gentle curve to full speed. */
export function joystickVector(dx, dy, radius = JOY_RADIUS) {
    const d = Math.hypot(dx, dy);
    if (d === 0) return { x: 0, y: 0 };
    const mag = Math.min(1, d / radius);
    if (mag < JOY_DEADZONE) return { x: 0, y: 0 };
    const k = Math.min(1, Math.pow((mag - JOY_DEADZONE) / (1 - JOY_DEADZONE), 0.8) * 1.15);
    return { x: (dx / d) * k, y: (dy / d) * k };
}

export class InputManager {
    constructor() {
        this.keys = Object.create(null);
        this.keymap = cloneKeymap(DEFAULT_KEYMAP);
        this.touch = { x: 0, y: 0 };
        this.pad = { x: 0, y: 0 };
        this.joy = null; // { id, ox, oy, x, y }
        this.onPause = () => {};
        this.onMute = () => {};
        this.onKey = () => {};
        this._prevButtons = [];
        this._cleanup = [];
    }

    setKeymap(map) {
        this.keymap = cloneKeymap(map || DEFAULT_KEYMAP);
    }

    _bound(action, key) {
        const list = this.keymap?.[action];
        return Array.isArray(list) && list.includes(key);
    }

    _on(target, ev, fn, opts) {
        target.addEventListener(ev, fn, opts);
        this._cleanup.push(() => target.removeEventListener(ev, fn, opts));
    }

    /**
     * @param {HTMLElement} surface  element that receives joystick drags (the play area)
     * @param {{base: HTMLElement, knob: HTMLElement}} joyEls  visual joystick
     */
    attach(surface, joyEls) {
        this._on(window, 'keydown', (e) => {
            const tag = e.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            const key = e.key.toLowerCase();
            this.keys[key] = true;
            if (this._bound('pause', key)) {
                e.preventDefault();
                this.onPause();
            } else if (this._bound('mute', key)) {
                e.preventDefault();
                this.onMute();
            } else if (key.startsWith('arrow') || key === ' ') {
                e.preventDefault();
            }
            this.onKey(key, e);
        });
        this._on(window, 'keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
        this._on(window, 'blur', () => {
            this.keys = Object.create(null);
            this._release();
        });

        const show = (on) => {
            if (!joyEls) return;
            joyEls.base.style.opacity = on ? '1' : '0';
        };
        const place = () => {
            if (!joyEls || !this.joy) return;
            joyEls.base.style.transform = `translate(${this.joy.ox}px, ${this.joy.oy}px)`;
            const v = joystickVector(this.joy.x - this.joy.ox, this.joy.y - this.joy.oy);
            joyEls.knob.style.transform = `translate(${v.x * JOY_RADIUS}px, ${v.y * JOY_RADIUS}px)`;
        };
        this._on(
            surface,
            'pointerdown',
            (e) => {
                if (this.joy || (e.pointerType === 'mouse' && e.button !== 0)) return;
                this.joy = {
                    id: e.pointerId,
                    ox: e.clientX,
                    oy: e.clientY,
                    x: e.clientX,
                    y: e.clientY
                };
                surface.setPointerCapture?.(e.pointerId);
                place();
                show(true);
                e.preventDefault();
            },
            { passive: false }
        );
        this._on(
            surface,
            'pointermove',
            (e) => {
                if (!this.joy || e.pointerId !== this.joy.id) return;
                this.joy.x = e.clientX;
                this.joy.y = e.clientY;
                // Let the base trail the thumb so a long drag doesn't need a reset.
                const dx = this.joy.x - this.joy.ox;
                const dy = this.joy.y - this.joy.oy;
                const d = Math.hypot(dx, dy);
                if (d > JOY_RADIUS * 1.6) {
                    this.joy.ox = this.joy.x - (dx / d) * JOY_RADIUS * 1.6;
                    this.joy.oy = this.joy.y - (dy / d) * JOY_RADIUS * 1.6;
                }
                const v = joystickVector(this.joy.x - this.joy.ox, this.joy.y - this.joy.oy);
                this.touch.x = v.x;
                this.touch.y = v.y;
                place();
                e.preventDefault();
            },
            { passive: false }
        );
        const end = (e) => {
            if (!this.joy || e.pointerId !== this.joy.id) return;
            this._release();
            show(false);
        };
        this._on(surface, 'pointerup', end);
        this._on(surface, 'pointercancel', end);
        this._on(surface, 'lostpointercapture', end);
    }

    _release() {
        this.joy = null;
        this.touch.x = 0;
        this.touch.y = 0;
    }

    /** Drop any held input (used when a menu opens so the bull doesn't keep running). */
    reset() {
        this.keys = Object.create(null);
        this._release();
    }

    detach() {
        for (const f of this._cleanup) f();
        this._cleanup.length = 0;
    }

    pollGamepad(onButton = () => {}) {
        let pads = null;
        try {
            pads =
                typeof navigator !== 'undefined' && navigator.getGamepads
                    ? navigator.getGamepads()
                    : null;
        } catch {
            pads = null;
        }
        const pad = pads && Array.from(pads).find(Boolean);
        if (!pad) {
            this.pad.x = 0;
            this.pad.y = 0;
            this._prevButtons = [];
            return;
        }
        const x = applyGamepadDeadzone(pad.axes[0] || 0);
        const y = applyGamepadDeadzone(pad.axes[1] || 0);
        const m = Math.hypot(x, y);
        this.pad.x = m > 1 ? x / m : x;
        this.pad.y = m > 1 ? y / m : y;
        const now = (pad.buttons || []).map((b) => !!b?.pressed);
        now.forEach((p, i) => {
            if (p && !this._prevButtons[i]) onButton(i);
        });
        this._prevButtons = now;
    }

    move() {
        const k = this.keys;
        const any = (action) => (this.keymap[action] || []).some((key) => k[key]);
        let x = (any('right') ? 1 : 0) - (any('left') ? 1 : 0);
        let y = (any('down') ? 1 : 0) - (any('up') ? 1 : 0);
        if (x === 0 && y === 0) {
            if (this.pad.x || this.pad.y) {
                x = this.pad.x;
                y = this.pad.y;
            } else {
                x = this.touch.x;
                y = this.touch.y;
            }
        }
        const len = Math.hypot(x, y);
        if (len > 1) {
            x /= len;
            y /= len;
        }
        return { x, y };
    }
}
