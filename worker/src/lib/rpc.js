/** Solana RPC endpoint: Helius when configured, else SOLANA_RPC, else the public mainnet endpoint. */
export function rpcUrl(env) {
    if (env.SOLANA_RPC) return env.SOLANA_RPC;
    if (env.HELIUS_API_KEY) return `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
    return 'https://api.mainnet-beta.solana.com';
}
