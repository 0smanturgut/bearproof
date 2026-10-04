/**
 * The one place the Worker calls Claude: the Telegram chat and the nightly chat digest (docs/DECISIONS.md D62).
 * A plain Messages API call with no tools: this model can read what it is given and write text, nothing else.
 * The Build Agent is a different thing (Claude Code on GitHub Actions) and never goes through here.
 *
 * Model: Claude Opus 5.5, the model the Build Agent runs on (TELEGRAM_CHAT_MODEL overrides it). A request its
 * safety classifiers decline is re-run on Anthropic's default fallback model (a beta); if the API refuses that
 * beta, the call is repeated without it. The cost is worked out from the API's own usage report at list price.
 */

import Anthropic from '@anthropic-ai/sdk';

export const CHAT_MODEL = 'claude-opus-5-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// USD per million tokens. A cache write costs 1.25x input (5-minute TTL). Listed most specific first.
const PRICES = [
    ['claude-opus-5-5', { in: 4, out: 20, read: 0.2 }],
    ['claude-opus-5', { in: 5, out: 25, read: 0.5 }],
    ['claude-opus-4-8', { in: 5, out: 25, read: 0.5 }],
    ['claude-sonnet-5-5', { in: 2, out: 10, read: 0.2 }],
    ['claude-haiku-4-5', { in: 1, out: 5, read: 0.1 }]
];
// A model that isn't in the table is priced at the dearest row, so the public number errs high, never low.
const DEAREST = { in: 5, out: 25, read: 0.5 };

/** The USD cost of one response, from the model that served it and the API's usage report. */
export function costUsd(model, usage) {
    const p = (PRICES.find(([id]) => String(model).startsWith(id)) || [null, DEAREST])[1];
    const u = usage || {};
    const n = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
    return (
        (n(u.input_tokens) * p.in +
            n(u.cache_creation_input_tokens) * p.in * 1.25 +
            n(u.cache_read_input_tokens) * p.read +
            n(u.output_tokens) * p.out) /
        1e6
    );
}

// Whether to ask for the server-side fallback. Switched off for the isolate once the API refuses the beta.
export const FALLBACKS = { on: true };

export function claudeReady(env) {
    return !!(env.CLAUDE || env.ANTHROPIC_API_KEY);
}

/**
 * Ask Claude once. `system` is a string or text blocks (put cache_control on the stable one), `schema` asks
 * for JSON that matches it. Returns { text, refused, beta, truncated, model, usage, usd }; throws on API errors.
 */
export async function ask(
    env,
    { system, messages, maxTokens = 2000, effort = 'low', schema = null, timeoutMs = 20000 }
) {
    // env.CLAUDE is a test double; ANTHROPIC_BASE_URL points local runs at a mock.
    const client =
        env.CLAUDE ||
        new Anthropic({
            apiKey: env.ANTHROPIC_API_KEY,
            maxRetries: 0,
            timeout: timeoutMs,
            ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {})
        });
    const model = env.TELEGRAM_CHAT_MODEL || CHAT_MODEL;
    const config = {
        // Haiku 4.5 has no effort setting; every model above it does.
        ...(/haiku/.test(model) ? {} : { effort }),
        ...(schema ? { format: { type: 'json_schema', schema } } : {})
    };
    const params = {
        model,
        max_tokens: maxTokens,
        system,
        messages,
        ...(Object.keys(config).length ? { output_config: config } : {})
    };
    let res;
    let beta = false;
    if (FALLBACKS.on) {
        try {
            res = await client.beta.messages.create({
                ...params,
                betas: [FALLBACK_BETA],
                fallbacks: 'default'
            });
            beta = true;
        } catch (err) {
            if (!(err instanceof Anthropic.BadRequestError)) throw err;
        }
    }
    if (!res) {
        res = await client.messages.create(params);
        // The request is fine without the beta, so the beta was what the API refused: stop asking for it
        // (in this isolate) instead of paying a failed round trip on every call.
        FALLBACKS.on = false;
    }
    const refused = res.stop_reason === 'refusal';
    const text = refused
        ? ''
        : (res.content || [])
              .filter((b) => b.type === 'text')
              .map((b) => b.text)
              .join('')
              .trim();
    return {
        text,
        refused,
        beta,
        truncated: res.stop_reason === 'max_tokens',
        model: res.model || model,
        usage: res.usage || {},
        usd: costUsd(res.model || model, res.usage)
    };
}
