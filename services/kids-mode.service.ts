/**
 * Kids Mode — the account flag and the PIN that leaves it.
 *
 * Mirrors web's `src/lib/api/dehub/kids-mode.ts`. Its own routes rather than
 * fields on the profile update: that endpoint is a multipart form that also
 * carries avatars, and a 403 for a wrong PIN does not belong in the same
 * response as "display name saved".
 *
 * Nothing here ever returns the PIN or its hash — `status` answers one boolean.
 *
 * @module services/kids-mode.service
 */

import { apiClient } from '../libs/api.client';

export interface KidsModeStatus {
  enabled: boolean;
}

/** The server's own message, so "wrong PIN" and "the pad is locked" stay apart. */
function messageFrom(error: any, fallback: string): string {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
}

export const KidsModeService = {
  /** Whether Kids Mode is on for the signed-in account. */
  async status(): Promise<KidsModeStatus> {
    const response = await apiClient.get('/kids-mode');
    return response?.result ?? { enabled: false };
  },

  /**
   * Turn Kids Mode on and set the PIN that turns it off.
   *
   * Refused by the server when Kids Mode is already on — changing the PIN means
   * turning it off with the current one first, or re-arming would be a way to
   * replace a PIN without knowing it.
   */
  async enable(pin: string): Promise<KidsModeStatus> {
    try {
      const response = await apiClient.post('/kids-mode/enable', { pin });
      return response?.result ?? { enabled: true };
    } catch (error: any) {
      throw new Error(messageFrom(error, 'Could not turn Kids Mode on.'));
    }
  },

  /**
   * Turn Kids Mode off with the PIN.
   *
   * Five wrong PINs lock the pad for fifteen minutes, server-side and on the
   * account, so the lock survives a restart and a different device.
   */
  async disable(pin: string): Promise<KidsModeStatus> {
    try {
      const response = await apiClient.post('/kids-mode/disable', { pin });
      return response?.result ?? { enabled: false };
    } catch (error: any) {
      throw new Error(messageFrom(error, 'That PIN is not right.'));
    }
  },
};
