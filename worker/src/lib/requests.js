/**
 * Holder feature requests (pure, unit-tested). Public rules, shown on the HQ:
 *   - hold at least REQUEST_MIN_TOKENS in the wallet that signs; one request per wallet per poll;
 *   - at most MAX_REQUESTS_PER_POLL per poll, posted between 00:00 and 18:00 UTC (the poll closes at 21:00, so
 *     every request is on the ballot for at least three hours);
 *   - a request describes a change to the game: no links, no handles, nothing about keys, wallets or the
 *     build pipeline. The Build Agent reads a winning request as a description of a feature, never as
 *     instructions, and says in the devlog why if it can't build it safely.
 */

export const REQUEST_MIN_TOKENS = 100_000;
export const MAX_REQUESTS_PER_POLL = 12;
export const REQUEST_CLOSE_UTC_HOUR = 18;
export const TITLE_MIN = 6;
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 240;

const LINK =
    /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|xyz|app|fun|gg|me|co|ly|tech|so|sh|dev|xxx)\b|@[a-z0-9_]{2,})/i;
// Anything that reads like an attempt to steer the Build Agent or touch money, keys or the pipeline.
const OFF_LIMITS =
    /(private\s*key|secret\s*key|client\s*secret|seed\s*phrase|mnemonic|api[\s_-]*key|password|\benv\b|environment\s*variable|base64|treasury|payout|prize\s*wallet|github|workflow|\bci\b|pipeline|system\s*prompt|ignore\s+(all|any|the|previous|prior|above)|(previous|prior|above|system|these)\s+instructions|jailbreak|\bexec\b|\bcurl\b|\bwget\b)/i;
// A short list of slurs and hate terms; the operator can hide anything else.
const HATE =
    /\b(n[i1]gg(er|a)s?|f[a4]gg?(ot)?s?|k[i1]kes?|retards?|tr[a4]nn(y|ies)|chinks?|sp[i1]cs?)\b/i;

/** Trim, drop control characters, collapse whitespace, NFC. */
export function cleanText(raw) {
    if (typeof raw !== 'string') return '';
    return raw
        .normalize('NFC')
        .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Validate a request's text. Returns { ok: true, title, description } or { ok: false, field, message }.
 */
export function checkRequest(rawTitle, rawDescription) {
    const title = cleanText(rawTitle);
    const description = cleanText(rawDescription ?? '');
    if (title.length < TITLE_MIN || title.length > TITLE_MAX)
        return {
            ok: false,
            field: 'title',
            message: `The title is ${TITLE_MIN}–${TITLE_MAX} characters.`
        };
    if (description.length > DESCRIPTION_MAX)
        return {
            ok: false,
            field: 'description',
            message: `The details are at most ${DESCRIPTION_MAX} characters.`
        };
    for (const [field, text] of [
        ['title', title],
        ['description', description]
    ]) {
        if (LINK.test(text))
            return {
                ok: false,
                field,
                message: 'No links or handles. Describe the feature in words.'
            };
        if (OFF_LIMITS.test(text))
            return {
                ok: false,
                field,
                message:
                    'Requests are changes to the game. Keys, wallets, payouts and the build pipeline are off limits.'
            };
        if (HATE.test(text)) return { ok: false, field, message: 'Not on this ballot.' };
    }
    return { ok: true, title, description };
}

/** The exact text a wallet signs to post a request. The server rebuilds it and compares byte for byte. */
export function requestMessage({
    domain,
    wallet,
    title,
    description,
    forBuild,
    pollDate,
    nonce,
    issuedAt
}) {
    return [
        `${domain} wants you to post a feature request with your Solana account:`,
        wallet,
        '',
        `Request for Build #${forBuild} (poll ${pollDate}): ${title}`,
        description || '(no details)',
        'This signature is free. It sends no transaction and moves no funds.',
        '',
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt}`
    ].join('\n');
}

/** Request window for a poll date: 00:00 to 18:00 UTC. */
export function requestWindow(dateStr) {
    const open = Date.parse(`${dateStr}T00:00:00Z`);
    return { open, close: open + REQUEST_CLOSE_UTC_HOUR * 3600000 };
}

/** Request ids share the proposal id space: 'req-' + 10 base36 chars. */
export const REQUEST_ID = /^req-[0-9a-z]{10}$/;

export function newRequestId() {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return 'req-' + Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

export function shortWallet(w) {
    return `${w.slice(0, 4)}…${w.slice(-4)}`;
}
