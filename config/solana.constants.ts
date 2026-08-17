/**
 * Solana chain + SPL token constants (#41) — mirrors dehub-stream-backend config.
 */
import env from "./env";

export const SOLANA_MAINNET_CHAIN_ID = 101 as const;
export const SOLANA_DEVNET_CHAIN_ID = 103 as const;

export const SOLANA_CHAIN_IDS: readonly number[] = [
  SOLANA_MAINNET_CHAIN_ID,
  SOLANA_DEVNET_CHAIN_ID,
];

export function isSolanaChain(chainId?: number | null): boolean {
  return chainId != null && SOLANA_CHAIN_IDS.includes(chainId);
}

export function isEvmChain(chainId?: number | null): boolean {
  return !isSolanaChain(chainId);
}

export const SOLANA_RPC_URLS: Record<number, string> = {
  // Public mainnet-beta RPC forbids sendTransaction (403) — mirrors the web
  // app's fallback (cosmic-echo-hero/src/lib/solana/mint.ts).
  [SOLANA_MAINNET_CHAIN_ID]: "https://solana-rpc.publicnode.com",
  [SOLANA_DEVNET_CHAIN_ID]: "https://api.devnet.solana.com",
};

export function getSolanaRpcUrl(chainId: number = SOLANA_MAINNET_CHAIN_ID): string {
  // Prefer a dedicated, authenticated RPC on mainnet when one is configured —
  // the public fallback below works but is shared/rate-limited. Set
  // ALCHEMY_API_KEY in .env (gitignored, never committed) to opt in — either
  // the bare key or the full https://.../v2/<key> URL both work, since
  // pasting the dashboard's full URL in as "the key" is an easy mistake and
  // wrapping it again silently doubles it into a broken URL.
  if (chainId === SOLANA_MAINNET_CHAIN_ID && env.ALCHEMY_API_KEY) {
    return env.ALCHEMY_API_KEY.startsWith("http")
      ? env.ALCHEMY_API_KEY
      : `https://solana-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`;
  }
  return SOLANA_RPC_URLS[chainId] || SOLANA_RPC_URLS[SOLANA_MAINNET_CHAIN_ID];
}

export interface SolanaSplToken {
  symbol: string;
  name: string;
  /** SPL mint address (base58). Native SOL uses wrapped SOL mint. */
  address: string;
  chainId: typeof SOLANA_MAINNET_CHAIN_ID;
  decimals: number;
}

/** SPL tokens accepted for token-gating / monetization on Solana. */
export const SOLANA_SPL_TOKENS: SolanaSplToken[] = [
  {
    symbol: "SOL",
    name: "Solana",
    address: "So11111111111111111111111111111111111111112",
    chainId: SOLANA_MAINNET_CHAIN_ID,
    decimals: 9,
  },
  {
    symbol: "USDT",
    name: "Tether",
    address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    chainId: SOLANA_MAINNET_CHAIN_ID,
    decimals: 6,
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    chainId: SOLANA_MAINNET_CHAIN_ID,
    decimals: 6,
  },
];

export function findSolanaToken(symbol?: string): SolanaSplToken | undefined {
  if (!symbol) return undefined;
  return SOLANA_SPL_TOKENS.find((t) => t.symbol === symbol);
}
