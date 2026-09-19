type Provider = { request: (args: { method: string; params?: any[] }) => Promise<any> };

/** Select by account identity, never by whichever provider happened to build. */
export async function selectSessionProvider<T extends Provider>(
  accountAddress: string,
  ownerAddress: string,
  ownerProvider: T,
  smartProvider: T | null,
): Promise<T> {
  if (accountAddress.toLowerCase() === ownerAddress.toLowerCase()) return ownerProvider;
  if (smartProvider) {
    const accounts = await smartProvider.request({ method: 'eth_accounts' });
    if (typeof accounts?.[0] === 'string' && accounts[0].toLowerCase() === accountAddress.toLowerCase()) {
      return smartProvider;
    }
  }
  throw new Error('Your Smart Wallet is temporarily unavailable. Please try again. Nothing was sent.');
}
