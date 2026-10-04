/**
 * POST /api/telegram/webhook: Telegram delivers every message of the group here (docs/DECISIONS.md D62).
 *
 *   - a member's message that breaks the house rules is deleted (lib/telegram.js `violation`); admins are exempt;
 *   - every other message is stored for 14 days, for the nightly digest and the bot's short-term context;
 *   - commands are answered from the project's own data (posts.js);
 *   - a reply to the bot or an @mention gets an answer from Claude, grounded in the FACTS block (facts.js), under
 *     a per-person cooldown and a daily budget, and filtered again before it is posted (lib/telegram.js tidyReply).
 *
 * The request must carry the secret Telegram was given at setup. The handler answers 200 at once and works in
 * the background, so Telegram never re-sends an update because Claude was slow. In private chats the bot answers
 * commands only: the conversation happens in the group, where everyone can read it.
 */

import { botIdentity, meter } from '../community.js';
import { ask, claudeReady } from '../lib/claude.js';
import { utcDate } from '../lib/daily.js';
import { all, first } from '../lib/db.js';
import { underLimit } from '../lib/guard.js';
import { error, json, readJson } from '../lib/http.js';
import { LINES, PERSONA } from '../lib/persona.js';
import { cleanText, isHate, textProblem } from '../lib/requests.js';
import {
    addressed,
    chatMatches,
    cleanMessage,
    esc,
    findUrls,
    fit,
    isOurChat,
    parseCommand,
    readMessage,
    tg,
    tidyReply,
    userKey,
    violation,
    webhookSecret
} from '../lib/telegram.js';
import { factsText, fmtUsd, utcTime } from '../lib/words.js';
import {
    postCa,
    postHeard,
    postHelp,
    postPlay,
    postReceipts,
    postRules,
    postToday,
    postTop,
    postVote
} from '../posts.js';
import { IDEAS_PER_DAY, IDEAS_PER_IP, checkIdea, ideaId } from './ideas.js';
import { timingSafeEqual } from './internal.js';
import { ledger } from './ledger.js';

export const COOLDOWN_MS = 20000;
export const REPLIES_PER_PERSON = 25;
export const DEFAULT_BUDGET_USD = 3;
const BUG_MIN = 10;
const BUG_MAX = 400;

const warn = (what) => (err) => console.warn(`[telegram] ${what}`, err?.message || err);
const guard = (s) => String(s).replace(/</g, '‹').replace(/>/g, '›');

// The facts bundle the build manifest, so they are loaded when first needed. Tests pass their own.
const gatherLive = (env, now) => import('../facts.js').then((m) => m.gather(env, now));

export function budgetUsd(env) {
    const n = Number(env.TELEGRAM_DAILY_BUDGET_USD);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_BUDGET_USD;
}

export async function telegramWebhook(request, env, ctx) {
    if (!env.TELEGRAM_BOT_TOKEN) return error(404, 'not_configured', 'Telegram is not set up.');
    const given = request.headers.get('x-telegram-bot-api-secret-token') || '';
    if (!given || !timingSafeEqual(given, await webhookSecret(env.TELEGRAM_BOT_TOKEN)))
        return error(401, 'unauthorized', 'Bad webhook secret.');
    const { data, error: bad } = await readJson(request, 256 * 1024);
    if (bad) return bad;
    ctx.waitUntil(handleUpdate(env, data).catch(warn('update')));
    return json({ ok: true });
}

// --- Sending and storing -------------------------------------------------------------

function reply(env, msg, post, { html = true } = {}) {
    return tg(env, 'sendMessage', {
        chat_id: msg.chatId,
        text: fit(post.text),
        ...(html ? { parse_mode: 'HTML' } : {}),
        link_preview_options: { is_disabled: true },
        reply_parameters: { message_id: msg.id, allow_sending_without_reply: true },
        ...(msg.threadId ? { message_thread_id: msg.threadId } : {}),
        ...(post.markup ? { reply_markup: post.markup } : {})
    });
}

const plain = (text) => ({ text });

/** Store a member's message. False when it was already there (Telegram re-sent the update). */
async function store(env, msg, text, kind) {
    const r = await env.DB.prepare(
        `INSERT OR IGNORE INTO tg_messages (chat_id, message_id, ts, day, user_id, name, text, reply_to, kind)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    )
        .bind(
            msg.chatId,
            msg.id,
            msg.ts,
            utcDate(msg.ts),
            msg.from.id,
            msg.from.name,
            text,
            msg.replyTo?.id ?? null,
            kind
        )
        .run();
    return !!r.meta?.changes;
}

/** Run `fn` at most once per `everyMs` for a key (the bot never repeats a notice in a busy chat). */
async function throttled(env, key, everyMs, now, fn) {
    const r = await env.DB.prepare(
        `INSERT INTO tg_announcements (key, ts) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET ts = excluded.ts WHERE tg_announcements.ts < ?3`
    )
        .bind(key, now, now - everyMs)
        .run();
    if (!r.meta?.changes) return false;
    await fn();
    return true;
}

/** The group's admins (cached ten minutes), or null when Telegram can't say: then nothing is removed. */
async function adminIds(env, chatId) {
    try {
        const cached = await env.CONFIG.get('tg:admins');
        if (cached) return new Set(JSON.parse(cached));
    } catch {
        // fall through to Telegram
    }
    try {
        const list = await tg(env, 'getChatAdministrators', { chat_id: chatId });
        const ids = list.map((a) => a.user?.id).filter(Number.isSafeInteger);
        await env.CONFIG.put('tg:admins', JSON.stringify(ids), { expirationTtl: 600 }).catch(
            warn('cache admins')
        );
        return new Set(ids);
    } catch (err) {
        warn('admins')(err);
        return null;
    }
}

async function remove(env, msg, v, now) {
    await tg(env, 'deleteMessage', { chat_id: msg.chatId, message_id: msg.id }).catch(
        warn('delete')
    );
    await env.DB.prepare('DELETE FROM tg_messages WHERE chat_id = ?1 AND message_id = ?2')
        .bind(msg.chatId, msg.id)
        .run()
        .catch(warn('forget'));
    await throttled(env, 'notice', 60000, now, () =>
        tg(env, 'sendMessage', {
            chat_id: msg.chatId,
            text: `Removed a message from ${esc(msg.from?.name || 'a member')}: ${esc(v.reason)}.`,
            parse_mode: 'HTML',
            disable_notification: true,
            ...(msg.threadId ? { message_thread_id: msg.threadId } : {})
        }).catch(warn('notice'))
    );
}

// --- Commands ------------------------------------------------------------------------

async function idea(env, msg, args, now) {
    const check = checkIdea(args);
    if (!check.ok)
        return reply(
            env,
            msg,
            plain(`${check.message} Like this: /idea a boss that shorts the chart`),
            { html: false }
        );
    const day = utcDate(now);
    const key = await userKey(msg.from.id);
    const counts = await first(
        env,
        'SELECT COUNT(*) AS total, SUM(CASE WHEN ip_key = ?2 THEN 1 ELSE 0 END) AS mine FROM ideas WHERE day = ?1',
        day,
        key
    );
    let text;
    if (!counts) text = 'Storage is unavailable. Try again shortly.';
    else if (counts.total >= IDEAS_PER_DAY)
        text = 'The ideas box is full for today. It opens again at 00:00 UTC.';
    else if ((counts.mine || 0) >= IDEAS_PER_IP)
        text = `That’s ${IDEAS_PER_IP} ideas from you today. More tomorrow.`;
    else {
        await env.DB.prepare(
            "INSERT INTO ideas (id, ts, day, text, ip_key, source) VALUES (?1, ?2, ?3, ?4, ?5, 'telegram')"
        )
            .bind(ideaId(), now, day, check.text, key)
            .run();
        text =
            'On the board. I read every idea before I write tomorrow’s ballot, and holders decide by vote.';
    }
    return reply(env, msg, plain(text), { html: false });
}

async function bug(env, msg, args) {
    const text = cleanText(args).slice(0, BUG_MAX);
    let answer;
    if (text.length < BUG_MIN)
        answer =
            'Tell me what happened, in a sentence. Like this: /bug the game froze when I opened a crate on Build #12, on my phone';
    else if (isHate(text) || findUrls(text).length)
        answer = 'No links in a bug report. Describe it in words.';
    else {
        await env.DB.prepare(
            `INSERT INTO tg_messages (chat_id, message_id, ts, day, user_id, name, text, reply_to, kind)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, 'bug')
             ON CONFLICT (chat_id, message_id) DO UPDATE SET kind = 'bug', text = excluded.text`
        )
            .bind(msg.chatId, msg.id, msg.ts, utcDate(msg.ts), msg.from.id, msg.from.name, text)
            .run();
        // The Build Agent can only change the game. Anything about wallets, payouts or the site is the operator's.
        answer = textProblem(text)
            ? 'Logged for the operator: that part isn’t in the game’s code, so the nightly session can’t touch it.'
            : 'Logged. Tonight’s build session gets it at 21:00 UTC. If you didn’t say which build and which device, add them.';
    }
    return reply(env, msg, plain(answer), { html: false });
}

async function command(env, msg, cmd, now, gather, { priv = false } = {}) {
    if (!(await underLimit(env.RL_SUBMIT, `tg-cmd:${msg.from.id}`))) return 'limited';
    const group = env.TELEGRAM_URL ? `: ${env.TELEGRAM_URL}` : '.';
    switch (cmd.cmd) {
        case 'rules':
            await reply(env, msg, postRules());
            return 'rules';
        case 'idea':
        case 'bug':
            if (priv) {
                await reply(env, msg, plain(`Send that one in the group${group}`), {
                    html: false
                });
                return 'group-only';
            }
            await (cmd.cmd === 'idea' ? idea(env, msg, cmd.args, now) : bug(env, msg, cmd.args));
            return cmd.cmd;
        case 'start':
        case 'help':
        case 'play':
        case 'today':
        case 'build':
        case 'vote':
        case 'top':
        case 'leaderboard':
        case 'receipts':
        case 'treasury':
        case 'heard':
        case 'ca':
        case 'contract': {
            const f = await gather(env, now);
            const c = cmd.cmd;
            let post;
            if (c === 'start' || c === 'help') post = postHelp(f, env);
            else if (c === 'play') post = postPlay(f, env);
            else if (c === 'today' || c === 'build') post = postToday(f, env);
            else if (c === 'vote') post = postVote(f, env);
            else if (c === 'top' || c === 'leaderboard') post = postTop(f, env);
            else if (c === 'heard') post = postHeard(f);
            else if (c === 'ca' || c === 'contract') post = postCa(f, env);
            else {
                let entries = [];
                try {
                    const res = await ledger(env);
                    entries = res.status === 200 ? (await res.json()).entries : [];
                } catch (err) {
                    warn('ledger')(err);
                }
                post = postReceipts(f, env, entries);
            }
            await reply(env, msg, post);
            return c;
        }
        default:
            return 'unknown-command';
    }
}

// --- The conversation ----------------------------------------------------------------

async function recentLog(env, msg, now) {
    const rows =
        (await all(
            env,
            `SELECT ts, name, text, kind FROM tg_messages
              WHERE chat_id = ?1 AND ts >= ?2 AND message_id != ?3 ORDER BY ts DESC LIMIT 12`,
            msg.chatId,
            now - 3600000,
            msg.id
        )) || [];
    return rows
        .reverse()
        .map(
            (r) =>
                `[${utcTime(r.ts)}] ${r.kind === 'bot' ? 'BEARPROOF (you)' : r.name || 'member'}: ${guard(r.text.slice(0, 300))}`
        )
        .join('\n');
}

async function chat(env, msg, me, text, now, gather) {
    const day = utcDate(now);
    const say = (line) => reply(env, msg, plain(line), { html: false }).catch(warn('reply'));
    if (!claudeReady(env)) {
        await throttled(env, 'no-brain', 30 * 60000, now, () => say(LINES.noBrain));
        return 'no-brain';
    }
    const mine = await first(
        env,
        "SELECT COUNT(*) AS n, MAX(ts) AS last FROM tg_messages WHERE day = ?1 AND kind = 'bot' AND to_user = ?2",
        day,
        msg.from.id
    );
    if (mine && (mine.n >= REPLIES_PER_PERSON || (mine.last && now - mine.last < COOLDOWN_MS)))
        return 'cooldown';
    const spent = await first(env, 'SELECT usd FROM tg_usage WHERE day = ?', day);
    const cap = budgetUsd(env);
    if ((spent?.usd || 0) >= cap) {
        await throttled(env, `budget:${day}`, 86400000, now, () => say(LINES.budget(fmtUsd(cap))));
        return 'budget';
    }
    if (!(await underLimit(env.RL_SUBMIT, 'tg-chat'))) return 'busy';

    tg(env, 'sendChatAction', {
        chat_id: msg.chatId,
        action: 'typing',
        ...(msg.threadId ? { message_thread_id: msg.threadId } : {})
    }).catch(() => {});
    const [f, log] = await Promise.all([gather(env, now), recentLog(env, msg, now)]);
    const asked = text.replace(new RegExp(`@${me.username}\\b`, 'ig'), '').trim();
    const user = [
        log ? `<chat_log>\n${log}\n</chat_log>` : '',
        msg.replyTo?.text
            ? `<replying_to author="${msg.replyTo.fromId === me.id ? 'you' : 'a member'}">\n${guard(msg.replyTo.text)}\n</replying_to>`
            : '',
        `<message from="${msg.from.name}">\n${guard(asked) || '(they mentioned you without saying anything)'}\n</message>`,
        'Reply to that message.'
    ]
        .filter(Boolean)
        .join('\n\n');
    let out;
    try {
        out = await ask(env, {
            system: [
                { type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } },
                {
                    type: 'text',
                    text: `FACTS (read from the project's own data a moment ago)\n${factsText(f)}`
                }
            ],
            messages: [{ role: 'user', content: user }],
            maxTokens: 2000,
            effort: 'low'
        });
    } catch (err) {
        warn('claude')(err);
        await throttled(env, 'failed', 60000, now, () => say(LINES.failed));
        return 'failed';
    }
    await meter(env, out, 'reply', now).catch(warn('meter'));
    const answer = out.refused ? LINES.declined : tidyReply(out.text, env) || LINES.filtered;
    const sent = await reply(env, msg, plain(answer), { html: false });
    await env.DB.prepare(
        `INSERT OR IGNORE INTO tg_messages (chat_id, message_id, ts, day, user_id, name, text, reply_to, kind, to_user)
         VALUES (?1, ?2, ?3, ?4, ?5, 'BEARPROOF', ?6, ?7, 'bot', ?8)`
    )
        .bind(
            msg.chatId,
            sent.message_id,
            now,
            day,
            me.id,
            cleanMessage(answer),
            msg.id,
            msg.from.id
        )
        .run()
        .catch(warn('store reply'));
    return 'replied';
}

// --- Updates -------------------------------------------------------------------------

/** Remember where the bot was added before its group is known, so naming it is one line for the operator. */
async function remember(env, chat) {
    if (await env.CONFIG.get('tg:seen_chat')) return;
    await env.CONFIG.put(
        'tg:seen_chat',
        JSON.stringify({
            id: chat.id,
            username: chat.username || null,
            title: cleanText(chat.title).slice(0, 80),
            type: chat.type
        })
    );
}

/**
 * Where a chat stands: 'home' (the group this bot serves), 'channel' (the announcement channel, if one is set),
 * 'unknown' (no group is named yet, or the named one hasn't been seen, so nothing is certain), or 'other'.
 * The group's numeric id is kept in CONFIG (tg:home) the first time TELEGRAM_CHAT matches, so renaming the group's
 * public link later can never make the bot walk out of its own home.
 */
async function place(env, chat) {
    const named = isOurChat(chat.id, chat.username, env);
    const known = Number(await env.CONFIG.get('tg:home').catch(() => null)) || null;
    if (named && known !== chat.id)
        await env.CONFIG.put('tg:home', String(chat.id)).catch(warn('remember home'));
    if (named || known === chat.id) return 'home';
    if (chatMatches(env.TELEGRAM_ANNOUNCE_CHAT, chat.id, chat.username)) return 'channel';
    return env.TELEGRAM_CHAT && known !== null ? 'other' : 'unknown';
}

/** Handle one update. Returns a short word for what happened (the tests read it; nothing else does). */
export async function handleUpdate(env, update, now = Date.now(), gather = gatherLive) {
    const moved = update?.my_chat_member;
    if (moved?.chat) {
        const c = moved.chat;
        if (c.type === 'private') return 'membership';
        if (!['member', 'administrator', 'restricted'].includes(moved.new_chat_member?.status))
            return 'membership';
        const where = await place(env, c);
        if (where === 'unknown') {
            await remember(env, c).catch(warn('remember'));
            return 'seen';
        }
        if (where !== 'other') return where;
        // Anyone can add a bot to their own group. This one works in one place.
        await tg(env, 'leaveChat', { chat_id: c.id }).catch(warn('leave'));
        return 'left';
    }

    const msg = readMessage(update);
    if (!msg) return 'ignored';
    const raw = update.message || update.edited_message;
    const me = await botIdentity(env);

    if (msg.chatType === 'private') {
        if (msg.edited || !msg.from || msg.from.isBot) return 'ignored';
        const cmd = parseCommand(msg.text, me.username);
        if (cmd && !cmd.other) return command(env, msg, cmd, now, gather, { priv: true });
        if (!(await underLimit(env.RL_SUBMIT, `tg-dm:${msg.from.id}`))) return 'limited';
        await reply(env, msg, plain(LINES.private(env.TELEGRAM_URL)), { html: false });
        return 'private';
    }

    const where = await place(env, raw.chat);
    if (where === 'unknown') {
        await remember(env, raw.chat).catch(warn('remember'));
        return 'seen';
    }
    if (where === 'channel') return 'channel';
    if (where === 'other') {
        await tg(env, 'leaveChat', { chat_id: msg.chatId }).catch(warn('leave'));
        return 'left';
    }

    if (msg.autoForward) return 'channel-post';
    if (msg.service) {
        if (msg.joinOrLeave)
            await tg(env, 'deleteMessage', { chat_id: msg.chatId, message_id: msg.id }).catch(
                warn('delete service')
            );
        return 'service';
    }
    if (msg.from?.id === me.id) return 'self';

    // An anonymous admin posts as the group itself.
    const anonymousAdmin = msg.senderChatId !== null && msg.senderChatId === msg.chatId;
    if (!anonymousAdmin) {
        const admins = await adminIds(env, msg.chatId);
        if (admins && !(msg.from && admins.has(msg.from.id))) {
            const v = violation(msg, env);
            if (v) {
                await remove(env, msg, v, now);
                return `removed:${v.rule}`;
            }
        }
    }
    // An edit is only checked against the rules again; what was stored stays as first written.
    if (msg.edited) return 'edited';
    if (anonymousAdmin || !msg.from || msg.from.isBot) return 'ignored';

    const cmd = parseCommand(msg.text, me.username);
    if (cmd?.other) return 'other-bot';
    if (cmd) return command(env, msg, cmd, now, gather);

    const text = cleanMessage(msg.text);
    if (!text) return 'empty';
    if (!(await store(env, msg, text, 'chat'))) return 'duplicate';
    if (addressed(msg, me)) return chat(env, msg, me, text, now, gather);
    return 'stored';
}
