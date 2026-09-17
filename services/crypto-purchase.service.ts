import { apiClient } from '../libs/api.client';
import type { PurchaseApi } from '../hooks/useCryptoPurchase';
import type { PaymentAsset, Purchase } from '../libs/crypto-purchase';

export const cryptoPurchaseApi: PurchaseApi = {
  assets: async () => (await apiClient.get<{ tokens: PaymentAsset[] }>('/dpay/crypto/tokens')).tokens,
  quote: params => apiClient.post('/dpay/crypto/quote', params, { timeoutMs: 40_000 }),
  create: params => apiClient.post('/dpay/crypto/intent', params, { isAuthRequired: true, timeoutMs: 40_000 }),
  list: async () => (await apiClient.get<{ intents: Purchase[] }>('/dpay/crypto/intents', { isAuthRequired: true })).intents,
  status: id => apiClient.get(`/dpay/crypto/intent/${encodeURIComponent(id)}`, { isAuthRequired: true }),
};
