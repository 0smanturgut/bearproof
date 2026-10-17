/*
 * The HQ's bot check (Cloudflare Turnstile), shared by the ideas box and the vote. Invisible for most people:
 * the check starts when someone starts typing or picks an option, so on a slow phone it has usually finished by
 * the time they press the button. A token is single use and lives five minutes; the widget refreshes it on its own.
 *
 *   const bot = window.bpBotCheck(boxElement, hintElement);
 *   bot.warmUp();                 start the check early
 *   const t = await bot.token();  a fresh token, or null (bot.error() says why)
 *   await bot.key();              the site key, or null when the server has none (then no token is needed)
 */
(function () {
    'use strict';
    let siteKey;
    let keyLoading = null;
    let scriptLoading = null;

    function key() {
        if (siteKey !== undefined) return Promise.resolve(siteKey);
        if (!keyLoading)
            keyLoading = fetch('/api/daily')
                .then((r) => r.json())
                .then((d) => (siteKey = (d && d.turnstileSiteKey) || null))
                .catch(() => (siteKey = null));
        return keyLoading;
    }

    function loadTurnstile() {
        if (window.turnstile && window.turnstile.render) return Promise.resolve(window.turnstile);
        if (scriptLoading) return scriptLoading;
        scriptLoading = new Promise((resolve, reject) => {
            window.__bearproofTurnstile = () => resolve(window.turnstile);
            const s = document.createElement('script');
            s.src =
                'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__bearproofTurnstile';
            s.async = true;
            s.onerror = () => {
                scriptLoading = null; // let a later try load it again
                reject(new Error('turnstile failed to load'));
            };
            document.head.appendChild(s);
        });
        return scriptLoading;
    }

    window.bpBotCheck = function (box, hintEl) {
        let widgetId = null;
        let running = false; // a check is under way
        let ready = null; // { token, at }: a token nobody has used yet
        let waiter = null; // resolves the token a caller is waiting for
        let needsTap = false;
        let lastError = '';

        function hint(on) {
            needsTap = on;
            if (hintEl) hintEl.hidden = !on;
            // Someone is waiting on the check and it wants a tap: bring the box into view.
            if (on && waiter && box && box.scrollIntoView)
                box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        function deliver(t) {
            running = false;
            if (waiter) waiter(t);
            else if (t) ready = { token: t, at: Date.now() };
        }

        /** Run the check: render the widget the first time, reset it after. Resolves false if it can't start. */
        async function check() {
            running = true;
            const sitekey = await key();
            let ts;
            try {
                if (!sitekey) throw new Error('no site key');
                ts = await loadTurnstile();
            } catch {
                lastError = sitekey ? 'script' : '';
                running = false;
                return false;
            }
            try {
                if (widgetId !== null) {
                    ts.reset(widgetId);
                    return true;
                }
                widgetId = ts.render(box, {
                    sitekey,
                    appearance: 'interaction-only',
                    theme: 'dark',
                    'refresh-expired': 'auto',
                    callback: (t) => {
                        lastError = '';
                        hint(false);
                        deliver(t);
                    },
                    'error-callback': (code) => {
                        lastError = String(code || 'error');
                        hint(false);
                        deliver(null);
                        return true; // handled: no console noise
                    },
                    'expired-callback': () => {
                        ready = null;
                    },
                    'before-interactive-callback': () => hint(true),
                    'after-interactive-callback': () => hint(false)
                });
                return true;
            } catch {
                lastError = 'render';
                running = false;
                return false;
            }
        }

        function warmUp() {
            if (widgetId === null && !running) check();
        }

        /** A fresh token, or null. Waits up to 45 s, or 3 minutes once the check wants a tap (the hint says so). */
        function token() {
            if (ready && Date.now() - ready.at < 280000) {
                const t = ready.token;
                ready = null;
                return Promise.resolve(t);
            }
            ready = null;
            return new Promise((resolve) => {
                const t0 = Date.now();
                let timer = null;
                const finish = (t) => {
                    if (!waiter) return;
                    waiter = null;
                    clearInterval(timer);
                    resolve(t);
                };
                waiter = finish;
                timer = setInterval(() => {
                    if (Date.now() - t0 > (needsTap ? 180000 : 45000)) {
                        lastError = lastError || 'timeout';
                        finish(null);
                    }
                }, 500);
                if (!running)
                    check().then((ok) => {
                        if (!ok) finish(null);
                    });
            });
        }

        return { key, warmUp, token, error: () => lastError };
    };
})();
