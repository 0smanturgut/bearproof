// Virtual clock, injected before any page script. Time only moves when the recorder calls __vt.step(ms):
// requestAnimationFrame, performance.now, Date, setTimeout/setInterval and every CSS animation or transition
// follow it, and Math.random is seeded. So a page renders the same frames at 60 fps however slow the capture is.
(() => {
    const EPOCH = Number(window.__VT_EPOCH__ || Date.parse('2026-09-27T12:00:00Z'));
    let now = 0;
    let rafId = 0;
    let timerId = 0;
    const raf = new Map();
    const timers = new Map();
    const RealDate = Date;
    window.requestAnimationFrame = (cb) => (raf.set(++rafId, cb), rafId);
    window.cancelAnimationFrame = (id) => raf.delete(id);
    performance.now = () => now;
    function VDate(...a) {
        if (!new.target) return new RealDate(EPOCH + now).toString();
        return a.length ? new RealDate(...a) : new RealDate(EPOCH + now);
    }
    VDate.prototype = RealDate.prototype;
    VDate.now = () => EPOCH + Math.floor(now);
    VDate.parse = RealDate.parse;
    VDate.UTC = RealDate.UTC;
    window.Date = VDate;
    const add = (fn, ms, args, every) => {
        const id = ++timerId;
        const d = Math.max(0, Number(ms) || 0);
        timers.set(id, { id, at: now + d, fn, args, every: every ? Math.max(1, d) : 0 });
        return id;
    };
    window.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false);
    window.setInterval = (fn, ms, ...args) => add(fn, ms, args, true);
    window.clearTimeout = window.clearInterval = (id) => timers.delete(id);
    let s = Number(window.__VT_SEED__ || 0x9e3779b9) >>> 0;
    Math.random = () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Free runs take their seed from crypto.getRandomValues: route it through the seeded generator too.
    if (window.crypto?.getRandomValues)
        window.crypto.getRandomValues = (arr) => {
            const max = 2 ** (8 * (arr.BYTES_PER_ELEMENT || 1));
            for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * max);
            return arr;
        };
    const seen = new WeakMap();
    const call = (fn, args) => {
        try {
            typeof fn === 'function' ? fn(...(args || [])) : (0, eval)(String(fn));
        } catch (e) {
            console.error(e);
        }
    };
    window.__vt = {
        now: () => now,
        /** Restart Math.random from a seed: a shot's run is then the same whatever the page did before. */
        reseed(n) {
            s = n >>> 0;
        },
        /** Advance virtual time by `ms`, firing due timers in order, then one animation frame. */
        step(ms) {
            const target = now + ms;
            for (let guard = 0; guard < 10000; guard++) {
                let next = null;
                for (const t of timers.values())
                    if (
                        t.at <= target &&
                        (!next || t.at < next.at || (t.at === next.at && t.id < next.id))
                    )
                        next = t;
                if (!next) break;
                now = Math.max(now, next.at);
                if (next.every) next.at += next.every;
                else timers.delete(next.id);
                call(next.fn, next.args);
            }
            now = target;
            const cbs = [...raf.values()];
            raf.clear();
            for (const cb of cbs) call(cb, [now]);
            // CSS animations and transitions: pause them and seek to virtual time.
            for (const a of document.getAnimations()) {
                if (!seen.has(a)) {
                    seen.set(a, now - (a.currentTime || 0));
                    a.pause();
                }
                a.currentTime = now - seen.get(a);
            }
        }
    };
})();
