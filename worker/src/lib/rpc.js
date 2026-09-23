/**
 * Solana RPC endpoint: SOLANA_RPC when set, else Helius when configured, else PublicNode's free endpoint.
 * (api.mainnet-beta.solana.com answers 403 to every request from a Worker, so it can't be the fallback.)
 */
export function rpcUrl(env) {
    if (env.SOLANA_RPC) return env.SOLANA_RPC;
    if (env.HELIUS_API_KEY) return `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
    return 'https://solana-rpc.publicnode.com';
}

/** One JSON-RPC call. Throws on HTTP or RPC errors. */
export async function rpc(env, method, params) {
    const res = await fetch(rpcUrl(env), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    if (!res.ok) throw new Error(`rpc ${method} ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(`rpc ${method}: ${body.error.message || 'error'}`);
    return body.result;
}
