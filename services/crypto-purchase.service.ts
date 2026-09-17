import { apiClient } from '../libs/api.client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PurchaseApi } from '../hooks/useCryptoPurchase';
import type { PaymentAsset, Purchase } from '../libs/crypto-purchase';

async function confirm(id: string, txHash: string): Promise<Purchase> {
  await AsyncStorage.setItem(`dehub.payment.${id}`, txHash);
  const receipt = await apiClient.post<Purchase>('/dpay/crypto/direct/confirm', { id, txHash }, { isAuthRequired: true });
  if (receipt.settlement === 'DIRECT_SETTLED') await AsyncStorage.removeItem(`dehub.payment.${id}`);
  return receipt;
}
export const cryptoPurchaseApi: PurchaseApi = {
  assets: async () => (await apiClient.get<{ tokens: PaymentAsset[] }>('/dpay/crypto/tokens')).tokens,
  quote: params => apiClient.post('/dpay/crypto/quote', params, { timeoutMs: 40_000 }),
  create: params => apiClient.post('/dpay/crypto/intent', params, { isAuthRequired: true, timeoutMs: 40_000 }),
  list: async () => (await apiClient.get<{ intents: Purchase[] }>('/dpay/crypto/intents', { isAuthRequired: true })).intents,
  confirm,
  status: async id => {
    const pending = await AsyncStorage.getItem(`dehub.payment.${id}`);
    return pending ? confirm(id, pending) : apiClient.get(`/dpay/crypto/intent/${encodeURIComponent(id)}`, { isAuthRequired: true });
  },
};
