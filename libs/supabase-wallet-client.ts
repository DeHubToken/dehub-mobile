/**
 * Attach the wallet address header used by Supabase RLS policies (same as web).
 */
export function withWalletHeader<T extends { setHeader?: (key: string, value: string) => T }>(
  query: T,
  walletAddress: string | null | undefined,
): T {
  if (!walletAddress) return query;
  if (query && typeof query.setHeader === "function") {
    return query.setHeader("x-wallet-address", walletAddress.toLowerCase());
  }
  return query;
}
