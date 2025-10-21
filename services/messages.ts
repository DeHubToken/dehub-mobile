import { apiClient } from '../libs/api.client';
import { Attachment, ID, Message, Reaction } from '../store/messages.types';

export type Paginated<T> = { items: T[]; nextCursor?: string };

export async function fetchMessages(conversationId: ID, params: { cursor?: string; dir?: 'older' | 'newer'; limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.dir) qs.set('dir', params.dir);
  if (params.limit) qs.set('limit', String(params.limit));
  return apiClient.get<Paginated<Message>>(`/conversations/${conversationId}/messages?${qs.toString()}`);
}

export async function sendText(conversationId: ID, body: { tempId: ID; text: string }) {
  return apiClient.post<Message>(`/conversations/${conversationId}/messages`, {
    tempId: body.tempId,
    kind: 'text',
    text: body.text,
  });
}

export async function sendMedia(conversationId: ID, body: { tempId: ID; attachments: Attachment[] }) {
  return apiClient.post<Message>(`/conversations/${conversationId}/messages`, {
    tempId: body.tempId,
    kind: 'media',
    attachments: body.attachments,
  });
}

export async function toggleReaction(messageId: ID, emoji: string, add: boolean) {
  if (add) return apiClient.post<{ reactions: Reaction[] }>(`/messages/${messageId}/reactions`, { emoji });
  const qs = new URLSearchParams({ emoji });
  return apiClient.delete<{ reactions: Reaction[] }>(`/messages/${messageId}/reactions?${qs.toString()}`);
}

export async function sendTyping(conversationId: ID, isTyping: boolean) {
  return apiClient.post<void>(`/conversations/${conversationId}/typing`, { isTyping });
}

export async function sendRead(conversationId: ID, messageId: ID) {
  return apiClient.post<void>(`/conversations/${conversationId}/read`, { messageId });
}
