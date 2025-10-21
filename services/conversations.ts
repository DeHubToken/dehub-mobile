import { apiClient } from '../libs/api.client';
import { Conversation, ID } from '../store/messages.types';

export type Paginated<T> = { items: T[]; nextCursor?: string };

export async function fetchConversations(cursor?: string, limit: number = 30) {
  const qs = new URLSearchParams();
  if (cursor) qs.set('cursor', cursor);
  if (limit) qs.set('limit', String(limit));
  return apiClient.get<Paginated<Conversation>>(`/conversations?${qs.toString()}`);
}

export async function fetchConversation(id: ID) {
  return apiClient.get<Conversation>(`/conversations/${id}`);
}

export async function createConversation(params: { type: 'direct' | 'group'; participantIds: ID[]; title?: string }) {
  return apiClient.post<Conversation>(`/conversations`, params);
}

export async function updateConversation(id: ID, patch: Partial<Pick<Conversation, 'title' | 'mutedUntil'>>) {
  return apiClient.patch<Conversation>(`/conversations/${id}`, patch);
}

export async function deleteConversation(id: ID) {
  return apiClient.delete<{ success: boolean }>(`/conversations/${id}`);
}
