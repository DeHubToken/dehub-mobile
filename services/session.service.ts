import { apiClient } from '../libs/api.client';
import { getRefreshToken } from '../libs/auth.utils';

export interface Session {
  deviceId: string;
  deviceName: string | null;
  platform: 'ios' | 'android' | 'web';
  appVersion: string | null;
  osVersion: string | null;
  ip: string | null;
  lastActiveAt: string;
  createdAt: string;
  current: boolean;
}

export async function fetchSessions(): Promise<Session[]> {
  const res = await apiClient.get<{ status: boolean; sessions: Session[] }>('/auth/sessions');
  return res.sessions;
}

export async function revokeSession(deviceId: string): Promise<void> {
  await apiClient.delete(`/auth/sessions/${encodeURIComponent(deviceId)}`);
}

export async function revokeOtherSessions(): Promise<number> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token available');
  const res = await apiClient.post<{ status: boolean; revokedCount: number }>(
    '/auth/sessions/revoke-others',
    { refreshToken },
  );
  return res.revokedCount;
}
