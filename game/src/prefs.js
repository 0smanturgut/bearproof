/**
 * @module prefs
 * @description Per-browser settings and identity. localStorage when available, memory otherwise
 * (private mode, sandboxed iframes). Nothing here affects the simulation.
 */

const KEY = 'bearproof_prefs_v1';
const ID_KEY = 'bearproof_player_id';

const reducedMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

export const DEFAULT_PREFS = Object.freeze({
    masterVolume: 0.7,
    sfxVolume: 0.8,
    musicVolume: 0.35,
    musicEnabled: true,
    muted: false,
    screenShake: !reducedMotion,
    reducedMotion,
    damageNumbers: true,
    vibration: true,
    name: ''
});

let memory = null;

function storage() {
    try {
        const s = window.localStorage;
        s.setItem('__br_probe', '1');
        s.removeItem('__br_probe');
        return s;
    } catch {
        return null;
    }
}

export function loadPrefs() {
    try {
        const raw = storage()?.getItem(KEY) ?? memory;
        return { ...DEFAULT_PREFS, ...(raw ? JSON.parse(raw) : {}) };
    } catch {
        return { ...DEFAULT_PREFS };
    }
}

export function savePrefs(prefs) {
    const s = JSON.stringify(prefs);
    memory = s;
    try {
        storage()?.setItem(KEY, s);
    } catch {
        /* quota or private mode: memory copy is enough for this session */
    }
}

/** Random, anonymous, per-browser id. Used for "players today" and to group a player's runs. */
export function playerId() {
    const s = storage();
    let id = s?.getItem(ID_KEY) || null;
    if (!id) {
        id =
            typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () =>
                      Math.floor(Math.random() * 16).toString(16)
                  );
        try {
            s?.setItem(ID_KEY, id);
        } catch {
            /* ignore */
        }
    }
    return id;
}

/** Display names: 1–16 of [A-Za-z0-9 _.-]. Mirrors the server rule. */
export function cleanName(raw) {
    const s = String(raw || '')
        .replace(/[^A-Za-z0-9 _.-]/g, '')
        .trim()
        .slice(0, 16);
    return s;
}
