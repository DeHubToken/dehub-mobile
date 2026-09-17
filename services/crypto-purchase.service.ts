import { apiClient } from '../libs/api.client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PurchaseApi } from '../hooks/useCryptoPurchase';
import type { PaymentAsset, Purchase } from '../libs/crypto-purchase';

const pendingPayments = new Map<string, string>();

async function confirm(id: string, txHash: string): Promise<Purchase> {
  pendingPayments.set(id, txHash);
  try { await AsyncStorage.setItem(`dehub.payment.${id}`, txHash); } catch { /* Still register the broadcast payment with the server. */ }
  const receipt = await apiClient.post<Purchase>('/dpay/crypto/direct/confirm', { id, txHash }, { isAuthRequired: true });
  if (receipt.settlement === 'DIRECT_SETTLED') {
    pendingPayments.delete(id);
    try { await AsyncStorage.removeItem(`dehub.payment.${id}`); } catch { /* The server already has the settled payment. */ }
  }
  return receipt;
}
export const cryptoPurchaseApi: PurchaseApi = {
  assets: async () => (await apiClient.get<{ tokens: PaymentAsset[] }>('/dpay/crypto/payment-options')).tokens,
  quote: params => apiClient.post('/dpay/crypto/quote', params, { timeoutMs: 40_000 }),
  create: params => apiClient.post('/dpay/crypto/intent', params, { isAuthRequired: true, timeoutMs: 40_000 }),
  list: async () => (await apiClient.get<{ intents: Purchase[] }>('/dpay/crypto/intents', { isAuthRequired: true })).intents,
  confirm,
  status: async id => {
    let pending = pendingPayments.get(id);
    try { pending ||= (await AsyncStorage.getItem(`dehub.payment.${id}`)) || undefined; } catch { /* Retry from memory when device storage is unavailable. */ }
    return pending ? confirm(id, pending) : apiClient.get(`/dpay/crypto/intent/${encodeURIComponent(id)}`, { isAuthRequired: true });
  },
};
