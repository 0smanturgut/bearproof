/**
 * @module turnstile
 * @description Cloudflare Turnstile before a score is submitted. Loaded only when the server has a site key.
 * Most players never see anything ("interaction-only"); the rest get a one-click check. A token is single use,
 * so every submission asks for a fresh one.
 */

let loading = null;
let widgetId = null;
let pending = null;

function load() {
    if (window.turnstile?.render) return Promise.resolve(window.turnstile);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
        // Turnstile calls this once its API is ready; script onload fires too early for render().
        window.__bearproofTurnstileReady = () => resolve(window.turnstile);
        const s = document.createElement('script');
        s.src =
            'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__bearproofTurnstileReady';
        s.async = true;
        s.onerror = () => reject(new Error('turnstile failed to load'));
        document.head.appendChild(s);
    });
    return loading;
}

/** Resolve with a token, or null if the check can't run (the server then decides). */
export async function turnstileToken(siteKey, container, timeoutMs = 15000) {
    if (!siteKey || !container) return null;
    let ts;
    try {
        ts = await load();
    } catch {
        return null;
    }
    return new Promise((resolve) => {
        const timer = setTimeout(() => finish(null), timeoutMs);
        let settled = false;
        function finish(token) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            pending = null;
            resolve(token);
        }
        pending = finish;
        try {
            if (widgetId !== null) {
                ts.reset(widgetId);
                return;
            }
            widgetId = ts.render(container, {
                sitekey: siteKey,
                appearance: 'interaction-only',
                theme: 'dark',
                callback: (token) => pending?.(token),
                'error-callback': () => pending?.(null),
                'expired-callback': () => ts.reset(widgetId)
            });
        } catch {
            finish(null); // never block a submission on the bot check; the server decides
        }
    });
}
