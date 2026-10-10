const transfers = new Set<string>();

/** Saved versions, received changes and draft requests share the same lock. */
export async function withCloudProjectTransfer<T>(wallet: string, check: () => void, action: () => Promise<T>): Promise<T> {
  const key = wallet.toLowerCase();
  if (transfers.has(key)) throw new Error("A cloud project operation is already running");
  check(); transfers.add(key);
  try { return await action(); } finally { transfers.delete(key); }
}
