/** Keep transport diagnostics out of trading UI without claiming a transaction failed. */
export function dexActionError(error: unknown, fallback = 'Could not complete the DEX action'): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/over rate limit|rate.?limit|\b429\b|exceeded maximum retry limit/i.test(message)) {
    return 'The network provider is busy. Please wait a moment. If you confirmed a transaction, check your wallet activity before retrying.';
  }
  return message || fallback;
}