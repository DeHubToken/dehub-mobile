import { apiClient } from '../libs/api.client';

export interface BlockDmResponse {
  success?: boolean;
  blocked?: boolean;
  message?: string;
  conversationId?: string;
  reportId?: string;
}

export interface UnblockDmResponse {
  success?: boolean;
  unblocked?: boolean;
  message?: string;
  conversationId?: string;
  reportId?: string;
}

export async function blockDm(conversationId: string, address: string, reason?: string) {
  const body = { conversationId, address, reason };
  return apiClient.post<BlockDmResponse>('/dm/block', body, { isAuthRequired: true });
}

export async function unBlockDm(conversationId: string, address: string, reportId?: string) {
  const params = new URLSearchParams();
  if (address) params.set('address', address);
  if (reportId) params.set('reportId', reportId);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return apiClient.get<UnblockDmResponse>(`/dm/un-block/${encodeURIComponent(conversationId)}${suffix}`, { isAuthRequired: true });
}
