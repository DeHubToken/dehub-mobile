import { AuthAdapter } from './authAdapter';
import { getSigningProvider, setSigningProvider } from '../../libs/provider.registry';
import { NETWORK_URLS } from '../../config/web3.constants';
import { defaultChainId } from '../../config/constants';
import { getLocalAccountDetails } from '../../libs/wallets.local';
import { getAuthUser } from '../../libs/auth.utils';
import { ethers } from 'ethers';
import { ethersService } from '../ethers.service';

type Eip1193Shim = {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
  chainConfig?: { chainId?: string | number };
};

function toHexChainId(id: number): string {
  return '0x' + id.toString(16);
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
          const built = await buildLocalEip1193FromPrivateKey(details.privateKey, this.chainId);
          if (built) {
            this.shim = built.shim;
            this.signer = built.signer;
            this.provider = built.provider;
            this.address = built.address;
            this.chainId = built.chainId;
            setSigningProvider(this.shim as any);
            return this.shim as any;
          }
        }
      }
    } catch {
      // ignore and return null below
    }
    return null;
  }

  async getAccounts(): Promise<string[]> {
    if (this.address) return [this.address];
    const prov: any = await this.getProvider();
    if (!prov?.request) return [];
    try { const accounts = await prov.request({ method: 'eth_accounts' }); return Array.isArray(accounts) ? accounts : []; } catch { return []; }
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
