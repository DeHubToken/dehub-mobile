export type StakeAttempt = {
  hash: string;
  wallet: string;
  chainId: number;
  token: string;
  pool: string;
  amount: string;
  amountHex: string;
  confirmed?: boolean;
};

export type StakeOutcome = 'confirmed' | 'reverted' | 'pending';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const hexValue = (value: string) => value.toLowerCase().replace(/^0x0*/, '') || '0';
const addressTopic = (address: string) => `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;

/** Absence of a receipt or expected event is not evidence that money did not move. */
export function classifyStakeReceipt(receipt: any, attempt: StakeAttempt): StakeOutcome {
  if (!receipt || receipt.transactionHash?.toLowerCase() !== attempt.hash.toLowerCase() || !receipt.blockHash) return 'pending';
  if (receipt.status === '0x0' || receipt.status === 0) return 'reverted';
  if (receipt.status !== '0x1' && receipt.status !== 1) return 'pending';
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
