/**
 * Telegram helpers (docs/DECISIONS.md D62): the Bot API call, the webhook secret, reading an update, and the
 * group's house rules. Pure where possible; tests in worker/test/telegram.test.js.
 *
 * The bot serves one public group (TELEGRAM_CHAT: "@name" or a numeric id). Everything a member types is
 * untrusted text: it is cleaned and clipped before it is stored, and it never reaches Telegram as HTML.
 */

import { cleanText, isHate } from './requests.js';
import { isWallet } from './vote.js';

const API = 'https://api.telegram.org';
export const MESSAGE_MAX = 600;

export class TelegramError extends Error {
    constructor(method, code, description) {
        super(`telegram ${method}: ${code} ${description}`);
        this.method = method;
        this.code = code;
    }
}

/** The site's public origin, for links in messages the cron writes (no request to read it from). */
export function site(env) {
    return env.SITE_URL || 'https://bearproof.app';
}

/**
 * Call a Bot API method. Throws TelegramError with Telegram's own description. The request URL carries the
 * token, so it is never logged or put in an error.
 */
export async function tg(env, method, params = {}) {
    if (!env.TELEGRAM_BOT_TOKEN) throw new TelegramError(method, 0, 'no bot token');
    let res;
    try {
        res = await (env.FETCH || fetch)(
            `${env.TELEGRAM_API || API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(params)
            }
        );
    } catch {
        throw new TelegramError(method, 0, 'network error');
    }
    const body = await res.json().catch(() => null);
    if (!body?.ok)
        throw new TelegramError(
            method,
            body?.error_code ?? res.status,
            String(body?.description || 'no description').slice(0, 200)
        );
    return body.result;
}

/**
 * The secret Telegram sends back with every webhook call (X-Telegram-Bot-Api-Secret-Token). Derived from the
 * bot token, so there is one secret to set, and a leaked webhook URL alone can't post updates.
 */
export async function webhookSecret(token) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(token),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = new Uint8Array(
        await crypto.subtle.sign('HMAC', key, enc.encode('bearproof-telegram-webhook-v1'))
    );
    return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A hashed Telegram user id, for the ideas box's per-person cap (the raw id never goes in that table). */
export async function userKey(userId) {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`bearproof-tg-v1:${userId}`)
    );
    return (
        'tg' +
        [...new Uint8Array(digest).slice(0, 15)]
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
    );
}

// --- Text ------------------------------------------------------------------

/** Escape text for Telegram's HTML parse mode. */
export function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function link(text, url) {
    return `<a href="${esc(url).replace(/"/g, '&quot;')}">${esc(text)}</a>`;
}

/** Rows of URL buttons under a message: [[{ text, url }, ...], ...]. */
export function buttons(rows) {
    return { inline_keyboard: rows.filter((r) => r.length) };
}

/** A member's first name as plain letters and digits, or "member". It goes into prompts and notices. */
export function cleanName(raw) {
    const s = cleanText(raw)
        .replace(/[^\p{L}\p{N} _.-]/gu, '')
        .trim()
        .slice(0, 24);
    return s || 'member';
}

/** A member's message as one clipped line. */
export function cleanMessage(raw) {
    return cleanText(raw).slice(0, MESSAGE_MAX);
}

// --- Updates ---------------------------------------------------------------

/** The message in an update (new or edited) in the shape the bot works with, or null. */
export function readMessage(update) {
    const m = update?.message || update?.edited_message;
    if (!m || !m.chat || !Number.isSafeInteger(m.message_id)) return null;
    const r = m.reply_to_message;
    return {
        edited: !update.message,
        id: m.message_id,
        chatId: m.chat.id,
        chatType: m.chat.type,
        chatUsername: m.chat.username || null,
        threadId: m.is_topic_message ? (m.message_thread_id ?? null) : null,
        ts: Number.isFinite(m.date) ? m.date * 1000 : Date.now(),
        from:
            m.from && Number.isSafeInteger(m.from.id)
                ? {
                      id: m.from.id,
                      isBot: !!m.from.is_bot,
                      name: cleanName(m.from.first_name)
                  }
                : null,
        senderChatId: m.sender_chat?.id ?? null,
        text: typeof m.text === 'string' ? m.text : typeof m.caption === 'string' ? m.caption : '',
        entities: Array.isArray(m.entities)
            ? m.entities
            : Array.isArray(m.caption_entities)
              ? m.caption_entities
              : [],
        // Telegram sends the message being answered along with the update.
        replyTo: r
            ? {
                  id: r.message_id,
                  fromId: r.from?.id ?? null,
                  text: cleanMessage(
                      typeof r.text === 'string'
                          ? r.text
                          : typeof r.caption === 'string'
                            ? r.caption
                            : ''
                  )
              }
            : null,
        // Joins and leaves are removed to keep the chat readable; other service messages are left alone.
        joinOrLeave: !!(m.new_chat_members || m.left_chat_member),
        service: !!(
            m.new_chat_members ||
            m.left_chat_member ||
            m.new_chat_title ||
            m.new_chat_photo ||
            m.delete_chat_photo ||
            m.pinned_message ||
            m.message_auto_delete_timer_changed ||
            m.video_chat_started ||
            m.video_chat_ended ||
            m.forum_topic_created
        ),
        // A post of the linked channel arriving in the group.
        autoForward: !!m.is_automatic_forward,
        fromChannel: m.forward_origin?.type === 'channel',
        viaBot: !!m.via_bot
    };
}

/**
 * A bot command at the start of a message: { cmd, args }, { other: true } when it names another bot, or null.
 */
export function parseCommand(text, botUsername) {
    const m = /^\/([A-Za-z0-9_]{1,32})(?:@([A-Za-z0-9_]{3,32}))?(?:\s+([\s\S]*))?$/.exec(
        String(text || '').trim()
    );
    if (!m) return null;
    if (m[2] && (!botUsername || m[2].toLowerCase() !== botUsername.toLowerCase()))
        return { other: true };
    return { cmd: m[1].toLowerCase(), args: (m[3] || '').trim() };
}

/** True when the message talks to the bot: a reply to one of its messages, or an @mention of it. */
export function addressed(msg, me) {
    if (!me) return false;
    if (msg.replyTo && msg.replyTo.fromId === me.id) return true;
    const at = `@${me.username}`.toLowerCase();
    return msg.entities.some(
        (e) =>
            e.type === 'mention' &&
            msg.text.slice(e.offset, e.offset + e.length).toLowerCase() === at
    );
}

/** True when a chat is the one a setting names: "@name" (a public chat's username) or a numeric id. */
export function chatMatches(setting, chatId, chatUsername) {
    const want = String(setting || '').trim();
    if (!want) return false;
    if (want.startsWith('@'))
        return !!chatUsername && chatUsername.toLowerCase() === want.slice(1).toLowerCase();
    return String(chatId) === want;
}

/** True when the chat is the one group the bot serves. */
export function isOurChat(chatId, chatUsername, env) {
    return chatMatches(env.TELEGRAM_CHAT, chatId, chatUsername);
}

// --- House rules -----------------------------------------------------------

const B58 = '1-9A-HJ-NP-Za-km-z';
const ADDRESS = new RegExp(`(?<![${B58}])[${B58}]{32,44}(?![${B58}])`, 'g');
// Telegram marks whatever it renders as a link (entities), so this only backs it up: schemes, www, and bare
// domains on endings nobody types by accident ("ok.so what now" is not a link here unless Telegram says it is).
const TLDS = 'com|net|org|io|xyz|app|gg|ly|tech|dev|fun|ru|cn|cc|vip|finance|exchange|network';
const URLISH = new RegExp(
    `(?:https?:\\/\\/|www\\.)[^\\s<>"']+|(?<![@\\w.-])(?:[a-z0-9-]+\\.)+(?:${TLDS})(?![\\w-])(?:\\/[^\\s<>"']*)?`,
    'gi'
);
// Second-person asks that only a scammer makes. A member asking about their own wallet doesn't match, and
// neither does the warning "never share your seed phrase".
const SCAM =
    /((?<!\b(?:never|not|don't|don’t|dont)\s)(send|share|enter|submit|give|type)\s+(me\s+|us\s+)?(your\s+)?((seed|recovery|secret)\s*(phrase|words)|private\s*key)|(validate|verify|sync|synchroni[sz]e|rectify|restore|migrate|revalidate)\s+(your\s+)?wallets?|claim\s+(your\s+)?(free\s+)?(airdrop|rewards?|bonus|tokens)\s+(here|now|at|on|via)|(dm|pm|inbox|message|contact|write)\s+(me|us|admin|support|the\s+team)\s+(for|to\s+get|to\s+claim)\s+(support|help|promo\w*|marketing|listing|partnership|collab\w*|investment|recovery|refund|airdrop)|guaranteed\s+(profit|returns?)|double\s+your\s+(sol|money|crypto|coins?))/i;

/** The project's own addresses: the only ones allowed in the group. */
export function officialAddresses(env) {
    return new Set(
        [
            env.TOKEN_MINT,
            env.ANSEM_MINT,
            env.TREASURY_WALLET,
            env.PRIZE_WALLET,
            env.CREATOR_VAULT
        ].filter(Boolean)
    );
}

/** Solana addresses in a text that aren't the project's own. */
export function foreignAddresses(text, env) {
    const ours = officialAddresses(env);
    return (String(text).match(ADDRESS) || []).filter((a) => isWallet(a) && !ours.has(a));
}

/** Everything in a message that is, or reads like, a link: entity links plus bare domains. */
export function findUrls(text, entities = []) {
    const out = new Set(String(text).match(URLISH) || []);
    for (const e of entities) {
        if (e?.type === 'text_link' && typeof e.url === 'string') out.add(e.url);
        if (e?.type === 'url') out.add(String(text).slice(e.offset, e.offset + e.length));
    }
    return [...out].filter(Boolean);
}

const MEMBER_HOSTS = ['solscan.io', 'x.com', 'twitter.com', 'youtube.com', 'youtu.be'];

/**
 * True when a link may stay in the group: the project's site, repo and coin page, its own Telegram, and a few
 * hosts members share clips and posts from (TELEGRAM_ALLOWED_HOSTS adds more). `own` narrows it to the site
 * alone, which is all the bot itself may link.
 */
export function allowedUrl(raw, env, { own = false } = {}) {
    let u;
    try {
        u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
        return false;
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    if (u.username || u.password) return false;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const ours = new URL(site(env)).hostname;
    if (host === ours) return true;
    if (own) return false;
    const path = u.pathname.toLowerCase();
    if (host === 'github.com') {
        const repo = new URL(env.REPO_URL || 'https://github.com/0smanturgut/bearproof').pathname;
        return path.startsWith(repo.toLowerCase());
    }
    if (host === 'pump.fun' || host === 'clawpump.tech')
        return !!env.TOKEN_MINT && u.href.includes(env.TOKEN_MINT);
    if (host === 't.me' || host === 'telegram.me') {
        const handles = [env.TELEGRAM_URL, env.TELEGRAM_CHAT]
            .filter((s) => typeof s === 'string' && s)
            .map((s) =>
                s
                    .replace(/^https?:\/\/(t|telegram)\.me\//i, '')
                    .replace(/^@/, '')
                    .toLowerCase()
            );
        return handles.includes(path.split('/')[1] || '');
    }
    const extra = String(env.TELEGRAM_ALLOWED_HOSTS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    return [...MEMBER_HOSTS, ...extra].some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * The house rule a member's message breaks, or null. Admins are exempt (the caller checks). Each rule exists
 * because of a scam that crypto groups see every day: fake contract addresses, phishing links, fake support.
 */
export function violation(msg, env) {
    if (msg.viaBot)
        return { rule: 'via-bot', reason: 'messages sent through other bots are removed' };
    if (msg.fromChannel) return { rule: 'forward', reason: 'forwards from channels are removed' };
    if (msg.senderChatId !== null && msg.senderChatId !== msg.chatId)
        return { rule: 'channel', reason: 'posting as a channel is off here' };
    const text = msg.text || '';
    if (foreignAddresses(text, env).length)
        return {
            rule: 'address',
            reason: 'the only addresses allowed here are the project’s own (see /ca)'
        };
    if (findUrls(text, msg.entities).some((u) => !allowedUrl(u, env)))
        return {
            rule: 'link',
            reason: 'links are limited to the project’s own pages, X, YouTube and Solscan'
        };
    if (SCAM.test(text))
        return {
            rule: 'scam',
            reason: 'it reads like a wallet or support scam. Admins never DM first, and nobody needs your seed phrase'
        };
    if (isHate(text)) return { rule: 'hate', reason: 'not in here' };
    return null;
}

// --- The bot's own words -----------------------------------------------------

// Investment talk the bot must never produce. The system prompt is the control; this catches a slip.
const PRICE_TALK =
    /\b(to the moon|price (target|prediction)|will (pump|moon|10x|100x|double|go up|skyrocket)|going to (pump|moon)|undervalued|buy (now|the dip)|(good|great|solid|safe) (entry|investment)|guaranteed (profit|returns?)|you should (buy|sell|hold|ape)|(buy|sell) signal)\b/i;

export const NO_PRICE = 'I don’t do price. I do builds, players and receipts.';

/**
 * A model-written reply made safe to post, or null when it shouldn't be posted at all: plain text, clipped, no
 * link except the site, no address except the project's own, no investment talk.
 */
export function tidyReply(raw, env) {
    let t = String(raw ?? '')
        .normalize('NFC')
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯]/g, '')
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (!t) return null;
    if (t.length > 900) t = t.slice(0, 900).replace(/\s+\S*$/, '') + '…';
    if (PRICE_TALK.test(t)) return NO_PRICE;
    if (foreignAddresses(t, env).length) return null;
    if (findUrls(t).some((u) => !allowedUrl(u, env, { own: true }))) return null;
    if (isHate(t)) return null;
    return t;
}
