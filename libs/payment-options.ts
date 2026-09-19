import type { PaymentAsset } from './crypto-purchase';

export const PAYMENT_CURRENCIES = ['SOL', 'ETH', 'USDT', 'USDC', 'BNB'] as const;
const primaryNetworks = new Set(['base', 'eth', 'bsc', 'sol', 'robinhood']);
export const isPrimaryPayment = (asset: PaymentAsset) => primaryNetworks.has(asset.blockchain) && (PAYMENT_CURRENCIES as readonly string[]).includes(asset.symbol);
export type PaymentBalances = Record<string, string | null>;
export const hasPaymentBalance = (value: string | null | undefined) => value != null && Number(value) > 0;
export function preferredPayment(assets: PaymentAsset[], balances: PaymentBalances) {
  const funded = assets.filter(a => isPrimaryPayment(a) && hasPaymentBalance(balances[a.assetId]));
  return funded.find(a => a.route === 'direct' && a.blockchain === 'base') || funded.find(a => a.route === 'direct') || funded[0];
}
function units(raw: bigint, decimals: number) {
  const value = raw.toString().padStart(decimals + 1, '0');
  return decimals ? `${value.slice(0, -decimals)}.${value.slice(-decimals)}`.replace(/\.?0+$/, '') : value;
}
/** Read-only balances. A failed network stays unknown, never a fabricated zero. */
export async function readPaymentBalances(assets: PaymentAsset[], wallet: string, solana: string | undefined, urls: Record<string, string | string[]>): Promise<PaymentBalances> {
  const rpc = async (chain: string, method: string, params: unknown[]) => {
    const endpoints = [...new Set([urls[chain]].flatMap(value => Array.isArray(value) ? value : value ? [value] : []))];
    if (!endpoints.length) throw new Error('Network unavailable');
    let lastError: unknown;
    for (const endpoint of endpoints) {
      for (let attempt = 0; attempt < (Array.isArray(urls[chain]) ? 2 : 1); attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: controller.signal });
          const body = await response.json();
          if (response.ok && !body.error && body.result != null) return body.result;
          lastError = new Error(`RPC ${response.status || 'error'}`);
          if (response.status !== 429 && response.status !== 408 && response.status < 500) break;
        } catch (error) { lastError = error; }
        finally { clearTimeout(timer); }
      }
    }
    throw lastError || new Error('Balance unavailable');
  };
  const entries = await Promise.all(assets.filter(isPrimaryPayment).map(async asset => {
    let balance: string | null = null;
    try {
      if (asset.blockchain === 'sol') {
        if (!solana) return [asset.assetId, null] as const;
        if (asset.symbol === 'SOL') balance = units(BigInt((await rpc('sol', 'getBalance', [solana, { commitment: 'confirmed' }])).value), 9);
        else if (asset.contractAddress) {
          const result = await rpc('sol', 'getTokenAccountsByOwner', [solana, { mint: asset.contractAddress }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
          const accounts = result.value.map((v: any) => v.account.data.parsed.info.tokenAmount);
          balance = units(accounts.reduce((sum: bigint, a: any) => sum + BigInt(a.amount), 0n), accounts[0]?.decimals ?? asset.decimals);
        }
      } else if (/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
        if (!asset.contractAddress || /^0x0+$/.test(asset.contractAddress)) balance = units(BigInt(await rpc(asset.blockchain, 'eth_getBalance', [wallet, 'latest'])), 18);
        else {
          const [raw, decimals] = await Promise.all([
            rpc(asset.blockchain, 'eth_call', [{ to: asset.contractAddress, data: '0x70a08231' + wallet.slice(2).toLowerCase().padStart(64, '0') }, 'latest']),
            rpc(asset.blockchain, 'eth_call', [{ to: asset.contractAddress, data: '0x313ce567' }, 'latest']),
          ]);
          const precision = Number(BigInt(decimals));
          if (precision > 36) throw new Error('Invalid precision');
          balance = units(BigInt(raw), precision);
        }
      }
    } catch { /* Keep the currency selectable when its balance cannot be read. */ }
    return [asset.assetId, balance] as const;
  }));
  return Object.fromEntries(entries);
}
