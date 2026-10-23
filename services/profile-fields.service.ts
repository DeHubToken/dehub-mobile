import { apiClient } from '../libs/api.client';
import type { ProfileField } from '../components/Profile/ProfileFieldsList';

/**
 * Profile fields (backend src/profile-fields). Saving checks every https link
 * for a rel="me" back to the profile and answers with `verifiedAt` on the
 * ones that have it.
 */
export async function saveProfileFields(fields: Array<{ name: string; value: string }>): Promise<ProfileField[]> {
  const response: any = await apiClient.put('/profile-fields', { fields }, { isAuthRequired: true });
  if (response && response.status === false) throw new Error(response.error || 'Request failed');
  const list = response?.result ?? response;
  return Array.isArray(list) ? list : [];
}
