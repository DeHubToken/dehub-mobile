/**
 * How much DHB a user actually has.
 * =================================
 * DHB is a position, not a chain balance. It lives on Base and BNB at once and
 * most of it is usually staked, so the liquid `balanceOf` a wallet screen would
 * reach for is close to meaningless: an account holding 11.1M DHB reads 0.
 *
 * `ownBadgeBalance` is the server's sum of exactly this — held plus staked,
 * both chains — and it is the number the leaderboard and the badge ladder use,
 * so preferring it keeps every surface agreeing.
 *
 * It is `ownBadgeBalance` and never `badgeBalance`: the latter is the
 * *rendered* badge figure and a delegation can hold it above what the wallet
 * owns, which on a wallet screen would be someone else's tokens shown as
 * yours. `balanceData` — the raw per-chain rows — gives the same figure
 * without that risk, so it is the fallback.
 *
 * Extracted from ProfileAssets so the Settings row cannot drift from it; the
 * Settings row used to show `tokenBalances.DHB`, the liquid half only.
 */

export interface DhbBalanceRow {
  chainId: number;
  walletBalance?: number | string;
  staked?: number | string;
}

export interface DhbPositionSource {
  ownBadgeBalance?: number;
  balanceData?: DhbBalanceRow[];
}

/** The chains whose DHB the backend counts. Must match the badge ladder. */
export const DHB_POSITION_CHAINS: Record<number, string> = {
  56: 'BNB Chain',
  8453: 'Base',
};

export interface DhbBreakdownRow {
  chain: string;
  wallet: number;
  staked: number;
}

/** Per-chain held/staked rows, and their sum. */
export function dhbBreakdown(user: DhbPositionSource | null | undefined): {
  rows: DhbBreakdownRow[];
  summed: number;
} {
  const rows = (user?.balanceData || [])
    .filter((entry) => DHB_POSITION_CHAINS[entry?.chainId] !== undefined)
    .map((entry) => ({
      chain: DHB_POSITION_CHAINS[entry.chainId],
      wallet: Number(entry.walletBalance) || 0,
      staked: Number(entry.staked) || 0,
    }))
    .filter((row) => row.wallet > 0 || row.staked > 0);
  const summed = rows.reduce((acc, row) => acc + row.wallet + row.staked, 0);
  return { rows, summed };
}

/**
 * The whole DHB position — held plus staked, across both chains.
 *
 * `liquidFallback` is used only when the server has told us nothing yet: it is
 * all we can stand behind at that point, and it under-reports a staker.
 */
export function dhbPosition(
  user: DhbPositionSource | null | undefined,
  liquidFallback: number | string = 0,
): number {
  const own = user?.ownBadgeBalance;
  if (typeof own === 'number' && own > 0) return own;
  const { summed } = dhbBreakdown(user);
  if (summed > 0) return summed;
  return Number(liquidFallback) || 0;
}
