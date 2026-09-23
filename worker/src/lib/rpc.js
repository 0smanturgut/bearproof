/**
 * Solana RPC endpoints, in order: SOLANA_RPC when set, Helius when configured, then free public endpoints.
 * (api.mainnet-beta.solana.com answers 403 to every request from a Worker, so it is never on the list.)
 * Free endpoints rate-limit Cloudflare's shared egress (HTTP 429), so every call retries briefly and then
 * falls through to the next endpoint. A Helius key makes all of this moot.
 */
const PUBLIC = ['https://solana-rpc.publicnode.com', 'https://rpc.solanatracker.io/public'];

export function rpcUrls(env) {
    const urls = [];
    if (env.SOLANA_RPC) urls.push(env.SOLANA_RPC);
    if (env.HELIUS_API_KEY)
        urls.push(`https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`);
    return [...urls, ...PUBLIC];
}

/** The preferred endpoint (web3.js Connection for payouts). */
export function rpcUrl(env) {
    return rpcUrls(env)[0];
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** One JSON-RPC call, tried on each endpoint in turn. Throws the last error if all of them fail. */
export async function rpc(env, method, params, { fetchFn = fetch, backoffMs = 250 } = {}) {
    let last = null;
    for (const url of rpcUrls(env)) {
        for (let attempt = 0; attempt < 2; attempt++) {
            let res;
            try {
                res = await fetchFn(url, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
                });
            } catch (err) {
                last = err;
                break; // network error: next endpoint
            }
            if (res.status === 429 || res.status >= 500) {
                last = new Error(`rpc ${method} ${res.status}`);
                if (attempt === 0) await wait(backoffMs);
                continue; // one retry on the same endpoint, then the next
            }
            const body = res.ok ? await res.json().catch(() => null) : null;
            if (!body) {
                last = new Error(`rpc ${method} ${res.status}${res.ok ? ' (not JSON)' : ''}`);
                break;
            }
            if (body.error) {
                // Plan limits, rate limits and upstream hiccups look alike here: try the next endpoint.
                last = new Error(`rpc ${method}: ${body.error.message || 'error'}`);
                break;
            }
            return body.result;
        }
    }
    throw last || new Error(`rpc ${method}: no endpoint`);
}
