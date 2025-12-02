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
// Use require to avoid eager resolution issues in Metro bundler / TS when file may be added later
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LocalProviderAdapter } = require('./localProviderAdapter');
// Privy adapter imported with require to avoid type resolution issues if optional dep missing
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrivyAuthAdapter } = require('./privyAuthAdapter');
import env from '../../config/env';

class CombinedAuthAdapter implements AuthAdapter {
  private local = new LocalProviderAdapter();
  private primary: AuthAdapter;
  private resolvedProvider: any | null = null;

  constructor(selected?: string) {
    const pick = (selected || env.AUTH_PROVIDER || 'web3auth').toLowerCase();
    this.primary = pick === 'privy' ? new PrivyAuthAdapter() : new Web3AuthAdapter();
  }

  async init(): Promise<void> {
    // Initialize both lazily as needed; no-op here
  }

  async getProvider(): Promise<any | null> {
    // 1) Try local provider (override or active local wallet)
    try {
      const localProv = await this.local.getProvider();
      if (localProv) {
        this.resolvedProvider = localProv;
        return localProv;
      }
    } catch {}
    // 2) Fallback to selected primary adapter
    const p = await this.primary.getProvider();
    this.resolvedProvider = p;
    return p;
  }

  async getAccounts(): Promise<string[]> {
    if (this.resolvedProvider?.request) {
      try {
        const res = await this.resolvedProvider.request({ method: 'eth_accounts' });
        return Array.isArray(res) ? res : [];
      } catch { return []; }
    }
    try { return await this.primary.getAccounts(); } catch { return []; }
  }

  async getChainId(): Promise<number | undefined> {
    if (this.resolvedProvider?.request) {
      try {
        const raw = await this.resolvedProvider.request({ method: 'eth_chainId' });
        if (typeof raw === 'string' && raw.startsWith('0x')) return parseInt(raw, 16);
        const n = Number(raw);
        return Number.isNaN(n) ? undefined : n;
      } catch { /* noop */ }
    }
    try { return await this.primary.getChainId(); } catch { return undefined; }
  }

  async getPrivateKey?(): Promise<string | undefined> {
    try {
      // Prefer local adapter for private key exposure if available
      const pk = await (this.local.getPrivateKey?.() as any);
      if (typeof pk === 'string' && pk.length > 0) return pk;
    } catch {}
    try { return await (this.primary.getPrivateKey?.() as any); } catch { return undefined; }
  }
}

export function createAuthAdapter(name?: string): AuthAdapter {
  // Combined adapter tries local (override/imported wallet) first, then falls back to selected primary.
  return new CombinedAuthAdapter(name);
}
