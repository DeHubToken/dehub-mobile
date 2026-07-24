
import { AuthAdapter } from './authAdapter';

// Lazy import holder to avoid throwing if dependency not yet installed.
let privyClient: any = null;
async function ensurePrivy(): Promise<any | null> {
  if (privyClient) return privyClient;
  if (typeof require === 'function') {
    try {
      // Use require to avoid TS resolution at compile time; runtime only.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod: any = require('@privy-io/react-auth');
      privyClient = mod?.privy ?? mod?.default ?? null;
      return privyClient;
    } catch (e) {
      console.warn('[PrivyAuthAdapter] Privy SDK not installed or failed to load', e);
      return null;
    }
  }
  return null;
}

export class PrivyAuthAdapter implements AuthAdapter {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await ensurePrivy();
    this.initialized = true;
  }

  async getProvider(): Promise<any | null> {
    await this.init();
    // Privy embedded wallets can expose an ethers.js provider; placeholder logic:
    try {
      const client = await ensurePrivy();
      const provider = client?.getProvider?.();
      return provider || null;
    } catch (e) {
      console.warn('[PrivyAuthAdapter] getProvider failed', e);
      return null;
    }
  }

  async getAccounts(): Promise<string[]> {
    try {
      const client = await ensurePrivy();
      const addr = client?.wallet?.address || client?.user?.wallet?.address;
      return addr ? [addr] : [];
    } catch {
      return [];
    }
  }

  async getChainId(): Promise<number | undefined> {
    try {
      const provider: any = await this.getProvider();
      if (!provider?.getNetwork) return undefined;
      const net = await provider.getNetwork();
      return net?.chainId;
    } catch {
      return undefined;
    }
  }

  async getPrivateKey(): Promise<string | undefined> {
    // Privy generally does NOT expose raw private keys; return undefined.
    return undefined;
  }
}
