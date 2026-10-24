import { apiClient } from '../libs/api.client';

/**
 * Followed hashtags (backend common/util/followed-tags). A followed tag's
 * posts join the Following feed; the server does that part. Tags travel
 * lowercase without the `#`.
 */
function unwrap<T>(response: any): T {
  if (response && response.status === false) throw new Error(response.error || 'Request failed');
  return (response?.result ?? response) as T;
}

export async function getFollowedTags(): Promise<string[]> {
  const list = unwrap<string[]>(await apiClient.get('/followed-tags', { isAuthRequired: true }));
  return Array.isArray(list) ? list : [];
}

export async function followTag(tag: string): Promise<void> {
  unwrap(await apiClient.post('/followed-tags', { tag }, { isAuthRequired: true }));
}

export async function unfollowTag(tag: string): Promise<void> {
  unwrap(await apiClient.delete(`/followed-tags/${encodeURIComponent(tag)}`, { isAuthRequired: true }));
}
