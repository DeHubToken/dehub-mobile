export class TransactionConfirmationPendingError extends Error {
  readonly code = 'TRANSACTION_CONFIRMATION_PENDING';
  constructor(readonly hash: string) {
    super(`Transaction submitted (${hash}). Confirmation is still pending. Check its status before sending again.`);
  }
}

export function receiptRpcUrls(chainId: number, preferred?: string): string[] {
  const publicUrls = chainId === 8453
    ? ['https://mainnet.base.org', 'https://base-rpc.publicnode.com']
    : chainId === 56
      ? ['https://bsc-dataseed.binance.org', 'https://bsc-rpc.publicnode.com']
      : [];
  return [...new Set([...(preferred ? [preferred] : []), ...publicUrls])];
}

/** Receipt recovery is read-only: it must never repeat a signed transaction. */
export async function waitForSubmittedReceipt<T>(
  hash: string,
  wait: () => Promise<T | null | undefined>,
  readers: ReadonlyArray<() => Promise<T | null | undefined>>,
  timeoutMs = 60_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const receipt = await Promise.race([
      wait(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TransactionConfirmationPendingError(hash)), timeoutMs);
      }),
    ]);
    if (receipt) return receipt;
  } catch (error: any) {
    // ethers attaches the mined receipt to a reverted transaction error.
    // A cancelled replacement is a different transaction, not a successful payment.
    if (error?.code === 'TRANSACTION_REPLACED' && error.cancelled) throw error;
    if (error?.receipt) return error.receipt as T;
  } finally {
    clearTimeout(timer);
  }
  // Some RPCs answer null rather than throwing while another already has the receipt.
  for (const read of readers) {
    try {
      const receipt = await read();
      if (receipt) return receipt;
    } catch { /* try the next independent endpoint */ }
  }
  throw new TransactionConfirmationPendingError(hash);
}
