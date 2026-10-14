export interface TipBadgeAccount {
  address: string;
  username?: string;
  badgeBalance: number;
  badgeLock?: any;
}

type Listener = (accounts: TipBadgeAccount[]) => void;
const listeners = new Set<Listener>();
export function subscribeTipBadges(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function publishTipBadges(accounts: TipBadgeAccount[]): void {
  listeners.forEach(listener => listener(accounts));
}

/** Update matching account snapshots without refetching unrelated queries. */
export function patchTipBadges<T>(value: T, accounts: TipBadgeAccount[]): T {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const next = value.map(item => patchTipBadges(item, accounts));
    return (next.some((item, i) => item !== value[i]) ? next : value) as T;
  }
  const row = value as Record<string, any>;
  const account = accounts.find(a =>
    [row.address, row.wallet_address, row.walletAddress].some(id => typeof id === 'string' && id.toLowerCase() === a.address.toLowerCase()) ||
    (a.username && typeof row.username === 'string' && row.username.toLowerCase() === a.username.toLowerCase()));
  let result = row;
  if (account) result = { ...row, badgeBalance: account.badgeBalance, badgeLock: account.badgeLock };
  for (const key of Object.keys(row)) {
    if (key === 'badgeBalance' || key === 'badgeLock') continue;
    const next = patchTipBadges(row[key], accounts);
    if (next !== row[key]) {
      if (result === row) result = { ...row };
      result[key] = next;
    }
  }
  return result as T;
}

