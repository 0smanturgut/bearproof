/**
 * The ideas box. Anyone can suggest a feature, no wallet; the Build Agent reads the last day's ideas before it
 * writes the next ballot, and holders still decide by vote.
 *
 *   POST /api/ideas   { text, turnstileToken }   8–200 chars, 3 per IP per UTC day, 100 per UTC day
 *   GET  /api/ideas[?hours=24]                    the latest 50 visible ideas, newest first
 *
 * The text is a player's and untrusted: the same filters as holder requests, shown with textContent, and handed to
 * the agent marked untrusted.
 */
import { all, first } from '../lib/db.js';
import { utcDate } from '../lib/daily.js';
import { clientIp, ipKey, underLimit, verifyTurnstile } from '../lib/guard.js';
import { error, json, readJson } from '../lib/http.js';
import { cleanText, textProblem } from '../lib/requests.js';

export const IDEA_MIN = 8;
export const IDEA_MAX = 200;
export const IDEAS_PER_IP = 3;
export const IDEAS_PER_DAY = 100;

/** Validate an idea's text. Returns { ok: true, text } or { ok: false, message }. */
export function checkIdea(raw) {
    const text = cleanText(raw);
    if (text.length < IDEA_MIN || text.length > IDEA_MAX)
        return { ok: false, message: `An idea is ${IDEA_MIN}–${IDEA_MAX} characters.` };
    const problem = textProblem(text);
    return problem ? { ok: false, message: problem } : { ok: true, text };
}

function ideaId() {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return 'idea-' + Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

export async function postIdea(request, env) {
    const { data, error: bad } = await readJson(request, 4096);
    if (bad) return bad;
    const check = checkIdea(data?.text);
    if (!check.ok) return error(400, 'invalid_field', check.message, { field: 'text' });
    const ip = clientIp(request);
    const key = await ipKey(ip);
    if (!(await underLimit(env.RL_SUBMIT, `idea:${key}`)))
        return error(429, 'rate_limited', 'Too many tries. Try again in a minute.');
    const bot = await verifyTurnstile(env, data?.turnstileToken, ip);
    if (bot !== 'passed' && bot !== 'skipped')
        return error(403, 'bot_check', "The bot check didn't pass. Reload the page and try again.");
    const now = Date.now();
    const day = utcDate(now);
    const counts = await first(
        env,
        'SELECT COUNT(*) AS total, SUM(CASE WHEN ip_key = ?2 THEN 1 ELSE 0 END) AS mine FROM ideas WHERE day = ?1',
        day,
        key
    );
    if (!counts) return error(503, 'db_unavailable', 'Storage is unavailable. Try again shortly.');
    if (counts.total >= IDEAS_PER_DAY)
        return error(
            429,
            'ideas_full',
            'The ideas box is full for today. It opens again at 00:00 UTC.'
        );
    if ((counts.mine || 0) >= IDEAS_PER_IP)
        return error(
            429,
            'rate_limited',
            `That's ${IDEAS_PER_IP} ideas today from here. More tomorrow.`
        );
    const id = ideaId();
    try {
        await env.DB.prepare(
            'INSERT INTO ideas (id, ts, day, text, ip_key) VALUES (?1, ?2, ?3, ?4, ?5)'
        )
            .bind(id, now, day, check.text, key)
            .run();
    } catch (err) {
        console.warn('[ideas]', err?.message || err);
        return error(503, 'db_unavailable', 'Storage is unavailable. Try again shortly.');
    }
    return json(
        { ok: true, idea: { id, ts: new Date(now).toISOString(), text: check.text } },
        { status: 201 }
    );
}

export async function getIdeas(request, env) {
    const params = new URL(request.url).searchParams;
    const hours = Math.min(24 * 14, Math.max(0, Number(params.get('hours')) || 0));
    const since = hours ? Date.now() - hours * 3600000 : 0;
    const rows = await all(
        env,
        'SELECT id, ts, text FROM ideas WHERE hidden = 0 AND ts >= ?1 ORDER BY ts DESC LIMIT 50',
        since
    );
    if (!rows) return error(503, 'db_unavailable', 'Storage is unavailable. Try again shortly.');
    const today = await first(
        env,
        'SELECT COUNT(*) AS n FROM ideas WHERE day = ?1',
        utcDate(Date.now())
    );
    return json({
        ideas: rows.map((r) => ({ id: r.id, ts: new Date(r.ts).toISOString(), text: r.text })),
        today: today?.n ?? 0,
        cap: IDEAS_PER_DAY,
        perIp: IDEAS_PER_IP
    });
}
