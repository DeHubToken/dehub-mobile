import { getCachedSolanaAddress } from '../libs/identity-wallet';
import { NETWORK_URLS } from '../config/web3.constants';
import { getSolanaRpcUrl } from '../config/solana.constants';
import { readPaymentBalances } from '../libs/payment-options';
import type { PaymentAsset } from '../libs/crypto-purchase';
export async function loadPaymentBalances(assets: PaymentAsset[], wallet: string, solana?: string) {
  return readPaymentBalances(assets, wallet, solana || (await getCachedSolanaAddress(wallet)) || undefined, { base: NETWORK_URLS[8453], eth: NETWORK_URLS[1], bsc: NETWORK_URLS[56], robinhood: NETWORK_URLS[4663], sol: getSolanaRpcUrl() });
}
