import { apiClient } from '../libs/api.client';

export interface PaymentChainConfig {
  chainId: number;
  name: string;
  dhbToken: string;
  streamController: string;
  weth?: string;
  dex?: { swapRouter: string; quoter: string; type: string };
  /** DeHubPaymentRouter address — present only when deployed for the chain (#45). */
  paymentRouter?: string;
}

export interface PaymentConfigResponse {
  chains: PaymentChainConfig[];
  fundTypes: { tip: number; ppv: number; stake: number };
}

let _cachedPaymentConfig: PaymentConfigResponse | null = null;

/**
 * GET /config/payments — DHB/router addresses per chain (#44/#45).
 * Public (no auth). Cached for the session; pass force to refetch.
 */
export async function getPaymentConfig(force = false): Promise<PaymentConfigResponse | null> {
  if (_cachedPaymentConfig && !force) return _cachedPaymentConfig;
  try {
    const res = await apiClient.fetch<{ status: boolean; result: PaymentConfigResponse }>(
      '/config/payments',
      { method: 'GET', isAuthRequired: false },
    );
    _cachedPaymentConfig = res?.result ?? null;
    return _cachedPaymentConfig;
  } catch (err) {
    console.warn('[payment] getPaymentConfig failed:', err);
    return null;
  }
}

/** Resolve the payment-router address for a chain, if deployed. */
export function getPaymentRouterAddress(
  config: PaymentConfigResponse | null,
  chainId?: number,
): string | undefined {
  if (!config || chainId == null) return undefined;
  return config.chains.find((c) => c.chainId === chainId)?.paymentRouter || undefined;
}

export interface ConfirmPPVResponse {
  result: boolean;
  queued?: boolean;
  confirmed?: boolean;
  alreadyUnlocked?: boolean;
  failed?: boolean;
  message?: string;
}

/**
 * POST /ppv/confirm — notify backend after sendFundsForPPV tx (#44).
 */
export async function confirmPPVPurchase(params: {
  tokenId: string | number;
  txHash: string;
  chainId?: number;
}): Promise<ConfirmPPVResponse> {
  return apiClient.fetch<ConfirmPPVResponse>('/ppv/confirm', {
    method: 'POST',
    body: {
      tokenId: Number(params.tokenId),
      txHash: params.txHash,
      chainId: params.chainId ?? 8453,
    },
    isAuthRequired: true,
  });
}
