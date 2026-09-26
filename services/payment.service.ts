import { apiClient } from '../libs/api.client';

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
