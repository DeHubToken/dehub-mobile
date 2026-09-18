/** DHB access counts the owner's wallet and stake across Base and BNB. */
export const DHB_HOLDINGS_TOKENS = [
  { chainId: 8453, address: '0xd20ab1015f6a2de4a6fddebab270113f689c2f7c' },
  { chainId: 56, address: '0x680d3113caf77b61b510f332d5ef4cf5b41a761d' },
];

export function isDhbHoldingsGate(symbol: string, tokenAddress?: string, chainIds: number[] = [8453]): boolean {
  if (!tokenAddress) return symbol.toUpperCase() === 'DHB';
  return DHB_HOLDINGS_TOKENS.some(token =>
    chainIds.includes(token.chainId) && token.address === tokenAddress.toLowerCase(),
  );
}

export interface HoldingsBalanceRow {
  chainId: number;
  tokenAddress: string;
  walletBalance?: number | string;
  staked?: number | string;
}

export function ownedDhbHoldings(rows: HoldingsBalanceRow[] = []): number {
  const positive = (value: unknown) => {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  };
  return rows.reduce((sum, row) => {
    const isDhb = DHB_HOLDINGS_TOKENS.some(token =>
      token.chainId === row.chainId && token.address === row.tokenAddress?.toLowerCase(),
    );
    return isDhb ? sum + positive(row.walletBalance) + positive(row.staked) : sum;
  }, 0);
}
