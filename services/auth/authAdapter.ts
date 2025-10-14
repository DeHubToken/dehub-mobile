// Generic auth adapter interface to allow future providers (e.g., Privy) without
// changing existing AuthContext API. Currently only Web3Auth implementation.
// Keeping surface intentionally small and focused on what AuthContext needs today.

export interface AuthAdapterProviderInfo {
  provider: any | null;
  chainId?: number;
}

export interface AuthAdapter {
  // Initialize any underlying SDKs; idempotent.
  init(): Promise<void>;
  // Return (and lazily initialize if needed) the EIP-1193 provider.
  getProvider(): Promise<any | null>;
  // Convenience helpers mirroring small subset of web3auth.service API.
  getAccounts(): Promise<string[]>;
  getChainId(): Promise<number | undefined>;
  // Optional private key retrieval (Web3Auth specific).
  getPrivateKey?(): Promise<string | undefined>;
}

// Factory currently only returns Web3Auth adapter.
import { Web3AuthAdapter } from './web3authAdapter';
// Privy adapter imported with require to avoid type resolution issues if optional dep missing
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrivyAuthAdapter } = require('./privyAuthAdapter');
import env from '../../config/env';

export function createAuthAdapter(name?: string): AuthAdapter {
  const selected = (name || env.AUTH_PROVIDER || 'web3auth').toLowerCase();
  switch (selected) {
    case 'privy':
      return new PrivyAuthAdapter();
    case 'web3auth':
    default:
      return new Web3AuthAdapter();
  }
}
