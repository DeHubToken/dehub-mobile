import { AuthAdapter } from './authAdapter';
import { getSigningProvider, setSigningProvider } from '../../libs/provider.registry';
import { NETWORK_URLS } from '../../config/web3.constants';
import { defaultChainId } from '../../config/constants';
import { getLocalAccountDetails } from '../../libs/wallets.local';
import { getAuthUser, getAuthMethod, getPreferredChainId, setPreferredChainId } from '../../libs/auth.utils';
import { ethers } from 'ethers';
import { ethersService } from '../ethers.service';
import { isChainAASupported, setupAAProvider } from '../../libs/wallet-core/smart-account';
import { createLogger } from '../../libs/logger';

const log = createLogger('LocalProviderAdapter');

type Eip1193Shim = {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
  chainConfig?: { chainId?: string | number };
};

function toHexChainId(id: number): string {
  return '0x' + id.toString(16);
}

/**
 * True when the signed-in address is not the key's own EOA — i.e. this account
 * was registered as its Safe smart account (see SignInScreen's completeLocalSignIn),
 * an address that only exists on the chains AA is configured for.
 */
function isSmartAccountAddress(identityAddress: string, privateKey: string): boolean {
  try {
    const pk = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    return identityAddress.toLowerCase() !== new ethers.Wallet(pk).address.toLowerCase();
  } catch {
    return false;
  }
}

// Module-scoped override to allow switching chains for local (private key) accounts
let LOCAL_CHAIN_ID_OVERRIDE: number | null = null;
export function setLocalAuthChainId(id: number) {
  LOCAL_CHAIN_ID_OVERRIDE = id;
}

async function buildLocalEip1193FromPrivateKey(pk: string, chainId: number): Promise<{ shim: Eip1193Shim; signer: ethers.Wallet; provider: ethers.providers.JsonRpcProvider; address: string; chainId: number; } | null> {
  try {
    // Reuse the app's centralized provider (same endpoints as ethersService) for consistency
    const provider = ethersService.getProvider(chainId || defaultChainId) as ethers.providers.JsonRpcProvider;
    const normalizedPk = pk.startsWith('0x') ? pk : `0x${pk}`;
    const signer = new ethers.Wallet(normalizedPk, provider);
    const address = await signer.getAddress();
    const shim: Eip1193Shim = {
      request: async ({ method, params }: { method: string; params?: any[] }) => {
        const p = params || [];
        // Helper to normalize JSON-RPC tx (with "gas") into ethers TransactionRequest (with "gasLimit")
        const normalizeTx = (raw: any): ethers.providers.TransactionRequest => {
          if (!raw || typeof raw !== 'object') return {};
          const out: ethers.providers.TransactionRequest = {};
          if (raw.from) out.from = raw.from;
          if (raw.to) out.to = raw.to;
          if (raw.data) out.data = raw.data;
          if (raw.value !== undefined) {
            try { out.value = ethers.BigNumber.from(raw.value); } catch { out.value = raw.value; }
          }
          const gasLike = raw.gasLimit ?? raw.gas;
          if (gasLike !== undefined) {
            try { out.gasLimit = ethers.BigNumber.from(gasLike); } catch { out.gasLimit = gasLike; }
          }
          if (raw.gasPrice !== undefined) {
            try { out.gasPrice = ethers.BigNumber.from(raw.gasPrice); } catch { out.gasPrice = raw.gasPrice; }
          }
          if (raw.maxFeePerGas !== undefined) {
            try { out.maxFeePerGas = ethers.BigNumber.from(raw.maxFeePerGas); } catch { out.maxFeePerGas = raw.maxFeePerGas; }
          }
          if (raw.maxPriorityFeePerGas !== undefined) {
            try { out.maxPriorityFeePerGas = ethers.BigNumber.from(raw.maxPriorityFeePerGas); } catch { out.maxPriorityFeePerGas = raw.maxPriorityFeePerGas; }
          }
          if (raw.nonce !== undefined) out.nonce = Number(raw.nonce);
          if (chainId) out.chainId = chainId;
          return out;
        };
        switch (method) {
          case 'eth_accounts':
          case 'eth_requestAccounts':
            return [address];
          case 'eth_chainId':
            return toHexChainId(chainId);
          case 'eth_sign': {
            // params: [address, data]
            const [_addr, data] = p.length === 2 ? p : [undefined, p[0]];
            const msg = typeof data === 'string' ? data : String(data);
            return await signer.signMessage(ethers.utils.arrayify(msg));
          }
          case 'personal_sign': {
            // params: [data, address]
            const [data] = p;
            const msg = typeof data === 'string' ? data : String(data);
            return await signer.signMessage(ethers.utils.isHexString(msg) ? ethers.utils.arrayify(msg) : msg);
          }
          case 'eth_estimateGas': {
            const txRaw = (p && p[0]) || {};
            const tx = normalizeTx(txRaw);
            try {
              const est = await signer.estimateGas(tx as any);
              return ethers.utils.hexlify(est);
            } catch (e) {
              // Fallback to provider
              return await (provider as any).send(method, p);
            }
          }
          case 'eth_sendTransaction': {
            const txNorm = normalizeTx((p && p[0]) || {});
            const resp = await signer.sendTransaction(txNorm as any);
            return resp.hash;
          }
          case 'private_key':
            return normalizedPk;
          default:
            return await (provider as any).send(method, p);
        }
      },
      on: () => { /* no-op for local signer */ },
      removeListener: () => { /* no-op */ },
      chainConfig: { chainId },
    };
    return { shim, signer, provider, address, chainId };
  } catch {
    return null;
  }
}

export class LocalProviderAdapter implements AuthAdapter {
  private shim: Eip1193Shim | null = null;
  private signer: ethers.Wallet | null = null;
  private provider: ethers.providers.JsonRpcProvider | null = null;
  private address: string | null = null;
  private chainId: number = defaultChainId;

  async init(): Promise<void> {
    // lazily built when getProvider() is called
    return;
  }

  async getProvider(): Promise<any | null> {
    // Only serve a local provider if the stored method is 'local'
    try {
      const { method } = await getAuthMethod();
      if (method && method !== 'local') {
        return null;
      }
    } catch {}
    // Prefer existing override set elsewhere
    const existing = getSigningProvider();
    if (existing) return existing;

    // Determine active address from persisted auth user
    try {
      const user: any | null = await getAuthUser<any>();
      const activeAddr: string | undefined = user?.walletAddress || user?.address;
      if (activeAddr) {
        const details = await getLocalAccountDetails(activeAddr);
        if (details?.privateKey) {
          // Prefer stored preferred chain id on boot if present
          let targetChainId = LOCAL_CHAIN_ID_OVERRIDE || this.chainId || defaultChainId;
          try {
            const pref = await getPreferredChainId();
            if (typeof pref === 'number' && !Number.isNaN(pref)) {
              targetChainId = pref;
            }
          } catch {}

          // A Safe smart account only exists on the chains AA is configured for.
          // Building this identity anywhere else silently demotes it to its owner
          // EOA -- a different address, and therefore a different backend account.
          // A preference naming such a chain could outlive the failed switch that
          // wrote it, so every launch rebuilt the wrong identity and every attempt
          // to switch away failed the same way. Fall back to the default chain and
          // forget the unusable preference instead.
          if (!isChainAASupported(targetChainId) && isSmartAccountAddress(activeAddr, details.privateKey)) {
            log.warn('preferred chain cannot host this smart account, falling back', {
              preferred: targetChainId,
              fallback: defaultChainId,
            });
            targetChainId = defaultChainId;
            try { await setPreferredChainId(defaultChainId); } catch {}
            LOCAL_CHAIN_ID_OVERRIDE = defaultChainId;
          }

          const built = await buildLocalEip1193FromPrivateKey(details.privateKey, targetChainId);
          if (built) {
            // Always keep the plain EOA signer/provider around -- getPrivateKey()/
            // getChainId() below rely on it regardless of which shim gets returned,
            // and "export private key" must always export the EOA owner key, never
            // a smart-account address.
            this.signer = built.signer;
            this.provider = built.provider;
            this.address = built.address;
            this.chainId = built.chainId;

            // Prefer the gasless Safe smart-account path (matches web's Pimlico setup).
            // setupAAProvider never throws -- it returns null on any failure (unsupported
            // chain, Pimlico outage, ...) so a sponsor-side problem falls back to the
            // plain EOA shim below rather than blocking the write entirely.
            let shimToUse: Eip1193Shim = built.shim;
            try {
              const aaProvider = await setupAAProvider(built.address, details.privateKey, targetChainId);
              if (aaProvider) {
                shimToUse = aaProvider as unknown as Eip1193Shim;
              }
            } catch (e) {
              log.warn('AA provider unavailable, using plain EOA signer', e);
            }

            this.shim = shimToUse;
            setSigningProvider(shimToUse as any);
            return shimToUse as any;
          }
        }
      }
    } catch {
      // ignore and return null below
    }
    return null;
  }

  async getAccounts(): Promise<string[]> {
    // Ask the live shim first -- once the Safe smart-account path is active, eth_accounts
    // returns the Safe address, not the cached EOA address in this.address. Only fall back
    // to this.address (the EOA identity address) if the shim can't answer.
    const prov: any = this.shim || (await this.getProvider());
    if (prov?.request) {
      try {
        const accounts = await prov.request({ method: 'eth_accounts' });
        if (Array.isArray(accounts) && accounts.length) return accounts;
      } catch {}
    }
    return this.address ? [this.address] : [];
  }

  async getChainId(): Promise<number | undefined> {
    if (this.provider) return this.chainId;
    const prov: any = await this.getProvider();
    if (!prov?.request) return undefined;
    try { const raw = await prov.request({ method: 'eth_chainId' }); return typeof raw === 'string' && raw.startsWith('0x') ? parseInt(raw, 16) : Number(raw) || undefined; } catch { return undefined; }
  }

  async getPrivateKey(): Promise<string | undefined> {
    if (this.signer) return (this.signer.privateKey as string);
    const prov: any = await this.getProvider();
    if (!prov?.request) return undefined;
    try { const pk = await prov.request({ method: 'private_key' }); return typeof pk === 'string' ? pk : undefined; } catch { return undefined; }
  }
}
