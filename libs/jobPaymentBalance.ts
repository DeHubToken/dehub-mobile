export interface JobReceiptBalance { purpose?: string; remainingDhb: number }

/** One owned receipt must cover a job; unrelated receipt balances cannot be pooled. */
export function largestJobReceipt(account: string | null | undefined, receiptAccount: string | null | undefined, receipts: readonly JobReceiptBalance[]): number {
  if (!account || account.toLowerCase() !== receiptAccount?.toLowerCase()) return 0;
  return receipts.reduce((largest, receipt) => receipt.purpose !== 'voice' && Number.isFinite(receipt.remainingDhb)
    ? Math.max(largest, receipt.remainingDhb) : largest, 0);
}
