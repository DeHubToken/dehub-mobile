import { apiClient } from '../../libs/api.client';
import { DmAction, DmDisableStatus } from '../enums/dm-preferences.enum';

export type GetContactsResponse = any[]; // backend returns aggregated DM contacts array

export async function getContactsByAddress(address: string): Promise<GetContactsResponse> {
  const addr = (address || '').toLowerCase();
  // Backend: GET /dm/contacts/:address -> returns array
  return apiClient.get<GetContactsResponse>(`/dm/contacts/${addr}`);
}

export type GetMessagesParams = {
  address: string; // current user's address (lowercased on server)
  q?: string;
  skip?: number;
  limit?: number;
};

export type GetMessagesResponse = { messages: any[] };

export async function getMessagesDm(conversationId: string, params: GetMessagesParams): Promise<GetMessagesResponse> {
  const qs = new URLSearchParams();
  if (params.address) qs.set('address', params.address.toLowerCase());
  if (params.q) qs.set('q', params.q);
  if (typeof params.skip === 'number') qs.set('skip', String(params.skip));
  if (typeof params.limit === 'number') qs.set('limit', String(params.limit));
  return apiClient.get<GetMessagesResponse>(`/dm/messages/${conversationId}?${qs.toString()}`);
}

// ---------------- DM User Preferences ----------------

export interface UpdateDmUserStatusResult {
  message?: string;
  data?: {
    address: string;
    disables?: DmDisableStatus[];
    minTipDhb?: number;
  };
}

/**
 * Update DM preferences for a user address.
 * Backend: POST /dm/user-status/:address with body { status, action, minTipDhb? }
 */
export async function updateDmUserStatus(
  address: string,
  status: DmDisableStatus,
  action: DmAction,
  minTipDhb?: number
): Promise<UpdateDmUserStatusResult> {
  const addr = (address || '').toLowerCase();
  const url = `/dm/user-status/${addr}`;
  const payload: any = { status, action };
  if (typeof minTipDhb !== 'undefined') payload.minTipDhb = minTipDhb;
  return apiClient.post<UpdateDmUserStatusResult>(url, payload, { isAuthRequired: true });
}
