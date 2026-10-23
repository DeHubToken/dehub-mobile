export type StakeAttempt = {
  hash: string;
  wallet: string;
  chainId: number;
  token: string;
  pool: string;
  amount: string;
  amountHex: string;
  confirmed?: boolean;
  submittedAt?: number;
  /** Actual transaction nonce, learned from RPC rather than inferred. */
  nonce?: string;
};

export type StakeOutcome = 'confirmed' | 'reverted' | 'pending';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const hexValue = (value: string) => value.toLowerCase().replace(/^0x0*/, '') || '0';
const addressTopic = (address: string) => `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;

/** Absence of a receipt or expected event is not evidence that money did not move. */
export function classifyStakeReceipt(receipt: any, attempt: StakeAttempt): StakeOutcome {
  if (!receipt || receipt.transactionHash?.toLowerCase() !== attempt.hash.toLowerCase() || !receipt.blockHash) return 'pending';
  if (receipt.status === '0x0' || receipt.status === 0 || receipt.status === 'reverted') return 'reverted';
  if (receipt.status !== '0x1' && receipt.status !== 1 && receipt.status !== 'success') return 'pending';
  if (!Array.isArray(receipt.logs)) return 'pending';
  const found = receipt.logs.some((log: any) =>
    !log.removed && log.address?.toLowerCase() === attempt.token.toLowerCase() &&
    log.topics?.[0]?.toLowerCase() === TRANSFER &&
    log.topics?.[1]?.toLowerCase() === addressTopic(attempt.wallet) &&
    log.topics?.[2]?.toLowerCase() === addressTopic(attempt.pool) &&
    typeof log.data === 'string' && /^0x[0-9a-f]+$/i.test(log.data) &&
    hexValue(log.data) === hexValue(attempt.amountHex));
  return found ? 'confirmed' : 'pending';
}

/** Only use a replacement receipt returned by the wallet's nonce-aware waiter. */
export function stakeFromReplacement(receipt: any, attempt: StakeAttempt): StakeAttempt | null {
  if (!receipt?.blockHash || !/^0x[0-9a-f]{64}$/i.test(receipt.transactionHash ?? '')) return null;
  if (!['0x1', 1, 'success'].includes(receipt.status) || !Array.isArray(receipt.logs)) return null;
  const transfers = receipt.logs.filter((log: any) =>
    !log.removed && log.address?.toLowerCase() === attempt.token.toLowerCase() &&
    log.topics?.[0]?.toLowerCase() === TRANSFER &&
    log.topics?.[1]?.toLowerCase() === addressTopic(attempt.wallet) &&
    log.topics?.[2]?.toLowerCase() === addressTopic(attempt.pool) &&
    typeof log.data === 'string' && /^0x[0-9a-f]+$/i.test(log.data));
  if (transfers.length !== 1 || BigInt(transfers[0].data) <= BigInt(0)) return null;
  const raw = BigInt(transfers[0].data).toString().padStart(19, '0');
  const amount = `${raw.slice(0, -18)}.${raw.slice(-18)}`.replace(/\.?0+$/, '');
  return { ...attempt, hash: receipt.transactionHash, amount, amountHex: transfers[0].data };
}

/** Refreshing history is bookkeeping; it cannot keep a mined transfer pending. */
export async function refreshConfirmedStake(
  refreshPosition: () => Promise<unknown>,
  syncHistory: () => Promise<unknown>,
  refreshBalances: () => Promise<unknown>,
): Promise<void> {
  await Promise.allSettled([refreshPosition(), syncHistory()]);
  await refreshBalances();
}

export async function readStakeReceipt(url: string, hash: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [hash] }),
    });
    if (!response.ok) throw new Error(`Receipt HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(`Receipt RPC ${payload.error.code}: ${String(payload.error.message).slice(0, 200)}`);
    return payload.result;
  } finally { clearTimeout(timer); }
}

/** Read only. Retrying confirmation must never resubmit the transfer. */
export async function confirmStake(
  attempt: StakeAttempt,
  readers: Array<() => Promise<unknown>>,
  onReadError: (error: unknown) => void = () => {},
): Promise<StakeOutcome> {
  const outcomes = await Promise.all(readers.map(async read => {
    try {
      const receipt = await read();
      const outcome = classifyStakeReceipt(receipt, attempt);
      if (outcome === 'pending') {
        try { onReadError(new Error(`Receipt unresolved: ${JSON.stringify(receipt).slice(0, 800)}`)); } catch {}
      }
      return outcome;
    }
    catch (error) { try { onReadError(error); } catch {} return 'pending' as const; }
  }));
  // Conflicting RPCs are unresolved; neither result is safe to announce.
  if (outcomes.includes('confirmed') && outcomes.includes('reverted')) return 'pending';
  if (outcomes.includes('confirmed')) return 'confirmed';
  if (outcomes.includes('reverted')) return 'reverted';
  return 'pending';
}

/** A missing hash alone cannot prove a failed transfer. Require two independent,
 * healthy RPCs, a quiet wallet nonce, and a 30-minute grace period before
 * retiring tracking. Never resubmit: a wallet may still rebroadcast its copy. */
export const STAKE_MISSING_GRACE_MS = 30 * 60 * 1000;
export type StakeRecovery = {
  outcome: StakeOutcome | 'replaced' | 'not-found';
  attempt: StakeAttempt;
};
export type StakeEvidence = {
  receipt: any;
  transaction: any;
  latestNonce?: string;
  pendingNonce?: string;
};

function nonceValue(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) return null;
  return BigInt(value);
}

export async function readStakeEvidence(url: string, attempt: StakeAttempt): Promise<StakeEvidence> {
  const rpc = async (method: string, params: unknown[]) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!response.ok) throw new Error(`Stake RPC HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error || !Object.prototype.hasOwnProperty.call(payload, 'result')) {
        throw new Error(`Stake RPC unavailable: ${method}`);
      }
      return payload.result;
    } finally { clearTimeout(timer); }
  };
  const receipt = await rpc('eth_getTransactionReceipt', [attempt.hash]);
  if (receipt !== null) return { receipt, transaction: undefined };
  const transaction = await rpc('eth_getTransactionByHash', [attempt.hash]);
  // A visible transaction remains pending. Save its actual nonce for recovery
  // after a restart; never guess a nonce from the wallet's current count.
  if (transaction !== null) return { receipt, transaction };
  // Only attempts saved before submittedAt existed lack one; those are days old.
  if (attempt.nonce === undefined && Date.now() - (attempt.submittedAt ?? 0) < STAKE_MISSING_GRACE_MS) {
    return { receipt, transaction };
  }
  const [latestNonce, pendingNonce] = await Promise.all([
    rpc('eth_getTransactionCount', [attempt.wallet, 'latest']),
    rpc('eth_getTransactionCount', [attempt.wallet, 'pending']),
  ]);
  return { receipt, transaction, latestNonce, pendingNonce };
}

/** Reconcile only evidence about this hash, wallet and chain. RPC errors and
 * contradictory observations never release a pending deposit. */
export async function recoverStake(
  original: StakeAttempt,
  readers: Array<() => Promise<StakeEvidence>>,
  onReadError: (error: unknown) => void = () => {},
  now = Date.now(),
): Promise<StakeRecovery> {
  // No submittedAt means it was saved before Oct 2026 tracking began, so the
  // grace period has long passed. Restarting the clock kept those notices up.
  const attempt = { ...original, submittedAt: original.submittedAt ?? 0 };
  const evidence = await Promise.all(readers.map(async read => {
    try { return await read(); }
    catch (error) { try { onReadError(error); } catch {} return null; }
  }));
  const outcomes = evidence.map(item => classifyStakeReceipt(item?.receipt, attempt));
  if (outcomes.includes('confirmed') && outcomes.includes('reverted')) return { outcome: 'pending', attempt };
  if (outcomes.includes('confirmed')) return { outcome: 'confirmed', attempt };
  if (outcomes.includes('reverted')) return { outcome: 'reverted', attempt };

  const transactions = evidence.map(item => item?.transaction).filter(tx => tx != null);
  const validTransactions = transactions.filter(tx =>
    tx.hash?.toLowerCase() === attempt.hash.toLowerCase() &&
    tx.from?.toLowerCase() === attempt.wallet.toLowerCase() && nonceValue(tx.nonce) !== null);
  if (validTransactions.length && validTransactions.every(tx => tx.nonce === validTransactions[0].nonce)) {
    attempt.nonce = validTransactions[0].nonce;
  }
  // A mined receipt without the expected transfer is not proof of failure,
  // and a transaction still visible anywhere must not be labelled dropped.
  if (transactions.length || evidence.some(item => item?.receipt != null)) return { outcome: 'pending', attempt };
  if (evidence.length < 2 || evidence.some(item => !item || item.receipt !== null || item.transaction !== null)) {
    return { outcome: 'pending', attempt };
  }
  const nonces = evidence.map(item => ({ latest: nonceValue(item!.latestNonce), pending: nonceValue(item!.pendingNonce) }));
  if (nonces.some(item => item.latest === null || item.pending === null || item.pending < item.latest)) return { outcome: 'pending', attempt };
  const nonce = nonceValue(attempt.nonce);
  if (nonce !== null && nonces.every(item => item.latest! > nonce)) return { outcome: 'replaced', attempt };
  if (Number.isFinite(attempt.submittedAt) && now - attempt.submittedAt >= STAKE_MISSING_GRACE_MS &&
      nonces.every(item => item.latest === item.pending) &&
      nonces.every(item => item.latest === nonces[0].latest)) {
    return { outcome: 'not-found', attempt };
  }
  return { outcome: 'pending', attempt };
}
