import { apiClient } from '../libs/api.client';

/**
 * Token launch waitlist ("Notify me" while Buy Tokens is closed).
 * Backend src/token-launch. Only a masked email ever comes back.
 */
export type TokenLaunchStatus = { joined: boolean; email?: string | null; accountEmail: string | null };
export type TokenLaunchJoin = { joined: true; already: boolean; email: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidLaunchEmail(raw: string): boolean {
  const email = raw.trim();
  return email.length >= 6 && email.length <= 254 && EMAIL.test(email);
}

export async function getTokenLaunchStatus(): Promise<TokenLaunchStatus> {
  return apiClient.get('/token-launch/notify', { isAuthRequired: true });
}

export async function joinTokenLaunch(input: { email?: string; useAccountEmail?: boolean; locale?: string }): Promise<TokenLaunchJoin> {
  return apiClient.post('/token-launch/notify', { ...input, source: 'app' }, { isAuthRequired: true });
}
