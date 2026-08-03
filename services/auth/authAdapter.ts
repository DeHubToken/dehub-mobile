// Every wallet is local now — either auto-generated for a Supabase identity
// (Google/email sign-in) or pasted by the user (Import Wallet). LocalProviderAdapter
// already resolves both cases (an active signing-provider override, then the
// persisted active address's stored key), so it's the only adapter needed.

export interface AuthAdapterProviderInfo {
  provider: any | null;
  chainId?: number;
}

export interface AuthAdapter {
  // Initialize any underlying SDKs; idempotent.
  init(): Promise<void>;
  // Return (and lazily initialize if needed) the EIP-1193 provider.
  getProvider(): Promise<any | null>;
  // Convenience helpers.
  getAccounts(): Promise<string[]>;
  getChainId(): Promise<number | undefined>;
  // Optional private key retrieval.
  getPrivateKey?(): Promise<string | undefined>;
}

import { LocalProviderAdapter } from './localProviderAdapter';

export function createAuthAdapter(): AuthAdapter {
  return new LocalProviderAdapter();
}
