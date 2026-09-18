/** Try each RPC explicitly: a quorum of one can accept an RPC error as its answer. */
export async function readReceiptFromProviders<T>(
  readers: ReadonlyArray<{ getTransactionReceipt(hash: string): Promise<T | null> }>,
  hash: string,
): Promise<T | null> {
  let lastError: unknown;
  let answered = false;
  for (const reader of readers) {
    try {
      const receipt = await reader.getTransactionReceipt(hash);
      answered = true;
      if (receipt !== null) return receipt;
    } catch (error) { lastError = error; }
  }
  if (answered) return null;
  throw lastError ?? new Error('No receipt RPC is available');
}
