export interface PaymentAsset {
  assetId: string;
  symbol: string;
  blockchain: string;
  decimals: number;
  contractAddress?: string;
  route?: 'direct' | 'swap';
  chainId?: number;
}

export interface PaymentQuote {
  amountInFormatted: string;
  amountInUsd?: string;
  timeEstimateSeconds?: number;
  estimatedTokensToReceive?: number;
  gasReserveUsd?: number;
}

export interface Purchase extends PaymentQuote {
  route?: 'direct' | 'swap';
  paymentChainId?: number;
  paymentTokenAddress?: string;
  wrapNativePayment?: boolean;
  paymentDecimals?: number;
  paymentTxHash?: string;
  id: string;
  depositAddress: string;
  depositMemo?: string;
  originAsset: string;
  originSymbol?: string;
  originBlockchain?: string;
  tokensToReceive?: number;
  tokenReceived?: string;
  refundTo?: string;
  receiverAddress?: string;
  expiresAt: number;
  createdAt?: string;
  settlement?: string;
  paymentStatus?: string;
  tokenSendStatus?: string;
  tokenSendTxnHash?: string;
  ethSendStatus?: string;
  ethSendTxnHash?: string;
}

export type PurchasePhase = 'awaiting' | 'confirming' | 'swapping' | 'delivering' | 'deliveryDelayed' | 'delivered' | 'gasPending' | 'refunded' | 'failed' | 'expired' | 'incomplete' | 'checking';

export function purchasePhase(p: Purchase, now = Date.now()): PurchasePhase {
  if (p.tokenSendStatus === 'sent') return p.ethSendStatus && p.ethSendStatus !== 'sent' ? 'gasPending' : 'delivered';
  if (p.settlement === 'REFUNDED') return 'refunded';
  if (p.settlement === 'FAILED') return 'failed';
  if (p.settlement === 'SUCCESS' || p.settlement === 'DIRECT_SETTLED') {
    return ['failed', 'cancelled'].includes(p.tokenSendStatus || '') ? 'deliveryDelayed' : 'delivering';
  }
  if (p.settlement === 'INCOMPLETE_DEPOSIT') return 'incomplete';
  if (p.settlement === 'KNOWN_DEPOSIT_TX') return 'confirming';
  if (p.settlement === 'PROCESSING') return 'swapping';
  if (p.settlement === 'DIRECT_PENDING' && p.paymentTxHash) return 'confirming';
  if (p.settlement === 'EXPIRED' || p.paymentStatus === 'expired') return 'expired';
  if (!p.settlement || p.settlement === 'PENDING_DEPOSIT' || p.settlement === 'DIRECT_PENDING') return p.expiresAt * 1000 <= now ? 'expired' : 'awaiting';
  return 'checking';
}

export function isPurchaseTerminal(p: Purchase) {
  return ['delivered', 'refunded', 'failed'].includes(purchasePhase(p));
}

export function canSendPayment(p: Purchase, now = Date.now()) {
  return purchasePhase(p, now) === 'awaiting' && !!p.amountInFormatted && !!p.originSymbol && !!p.originBlockchain;
}

export function purchasePollDelay(p: Purchase, now = Date.now()) {
  const phase = purchasePhase(p, now);
  if (phase === 'delivering' || phase === 'gasPending') return 10_000;
  if (phase === 'awaiting' && now - Date.parse(p.createdAt || '') < 10 * 60_000) return 15_000;
  return 30_000;
}

export function validDhbAmount(amount: number) { return Number.isFinite(amount) && Number.isSafeInteger(amount) && amount > 0; }

export function paymentKey(wallet: string, asset: string, amount: number, refund: string) {
  return JSON.stringify([wallet.toLowerCase(), asset, amount, refund]);
}

export const EVM_PAYMENT_CHAINS = new Set(['eth', 'base', 'arb', 'bsc', 'pol', 'op', 'avax', 'gnosis', 'scroll', 'monad', 'bera', 'xlayer', 'plasma', 'abs', 'hypercore', 'adi']);

const CHAINS: Record<string, string> = { eth: 'Ethereum', robinhood: 'Robinhood', base: 'Base', arb: 'Arbitrum', bsc: 'BNB Chain', pol: 'Polygon', op: 'Optimism', sol: 'Solana', btc: 'Bitcoin', doge: 'Dogecoin', ltc: 'Litecoin', bch: 'Bitcoin Cash', avax: 'Avalanche', near: 'NEAR', tron: 'Tron', xrp: 'XRP Ledger', ton: 'TON', sui: 'Sui', stellar: 'Stellar', zec: 'Zcash', aptos: 'Aptos', cardano: 'Cardano' };
export const paymentChainName = (chain: string) => CHAINS[chain] || chain.toUpperCase();

export function defaultRefund(chain: string, wallet: string, solana?: string) {
  if (EVM_PAYMENT_CHAINS.has(chain)) return wallet;
  return chain === 'sol' ? solana || '' : '';
}

export function estimateMinutes(seconds?: number): number | null {
  return Number.isFinite(seconds) && seconds! > 0 ? Math.max(1, Math.ceil(seconds! / 60)) : null;
}
