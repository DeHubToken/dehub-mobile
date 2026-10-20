import { apiClient } from '../libs/api.client';

export interface TwitchMirrorStatus {
  available: boolean;
  connected: boolean;
  login: string | null;
  displayName: string | null;
  enabled: boolean;
  state: string;
  live: boolean;
  lastError: string | null;
  postUrl: string | null;
}

function unwrap<T>(body: T | { result: T }): T {
  return body && typeof body === 'object' && 'result' in body ? body.result : body as T;
}

export const TWITCH_REDIRECT = 'dehub://twitch-connected';
export const twitchMirror = {
  async status(): Promise<TwitchMirrorStatus> {
    return unwrap(await apiClient.fetch<TwitchMirrorStatus | { result: TwitchMirrorStatus }>('/live/twitch'));
  },
  async connect(): Promise<string> {
    return unwrap(await apiClient.fetch<{ url: string } | { result: { url: string } }>('/live/twitch/connect', {
      method: 'POST', body: { mobile: true },
    })).url;
  },
  async enable(enabled: boolean): Promise<TwitchMirrorStatus> {
    return unwrap(await apiClient.fetch<TwitchMirrorStatus | { result: TwitchMirrorStatus }>('/live/twitch', { method: 'PATCH', body: { enabled } }));
  },
  async disconnect(): Promise<TwitchMirrorStatus> {
    return unwrap(await apiClient.fetch<TwitchMirrorStatus | { result: TwitchMirrorStatus }>('/live/twitch', { method: 'DELETE' }));
  },
};
