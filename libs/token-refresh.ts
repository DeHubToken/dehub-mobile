import { Platform } from 'react-native';
import Constants from 'expo-constants';
import env from '../config/env';
import {
  getRefreshToken,
  setRefreshToken,
  setAuthToken,
  setTokenExpiresAt,
  getTokenExpiresAt,
  clearAuthData,
} from './auth.utils';

const API_BASE_URL = env.API_URL;
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const PLATFORM = Platform.OS;

// Buffer before expiry to trigger proactive refresh (60 seconds)
const PROACTIVE_REFRESH_BUFFER_MS = 60 * 1000;

type QueueEntry = {
  resolve: (token: string) => void;
  reject: (error: any) => void;
};

type TokenRefreshListener = () => void;

let isRefreshing = false;
let failedQueue: QueueEntry[] = [];
let onTokenRefreshedListeners: TokenRefreshListener[] = [];

function processQueue(error: any, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  failedQueue = [];
}

function notifyListeners() {
  onTokenRefreshedListeners.forEach((fn) => {
    try { fn(); } catch {}
  });
}

/**
 * Thrown on a non-2xx response, with the HTTP status attached so callers can
 * tell "the refresh token was rejected" (401/403 — genuinely signed out)
 * apart from a network blip or a 5xx (server unreachable — still logged in,
 * just can't prove it this instant). A plain `fetch` rejection (offline, DNS,
 * timeout) has no `.status` at all, which the caller treats the same as a
 * 5xx: don't destroy credentials over it.
 */
class RefreshRejectedError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'RefreshRejectedError';
    this.status = status;
  }
}

/**
 * Calls POST /auth/refresh using raw fetch (not apiClient) to avoid
 * circular interceptor loops. No auth header needed.
 */
async function callRefreshEndpoint(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const url = `${API_BASE_URL}/auth/refresh`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Client-Type': 'mobile',
      'X-Platform': PLATFORM,
      'X-App-Version': APP_VERSION,
    },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new RefreshRejectedError(
      data?.message || `Refresh failed (${response.status})`,
      response.status
    );
  }

  return response.json();
}

export const tokenRefreshManager = {
  /**
   * Attempt to refresh the access token using the stored refresh token.
   * Coalesces concurrent calls — only one refresh request is in-flight at a time.
   * Returns the new access token on success, or null on failure (triggers full logout).
   */
  attemptRefresh(): Promise<string | null> {
    if (isRefreshing) {
      return new Promise<string | null>((resolve, reject) => {
        failedQueue.push({
          resolve: (token) => resolve(token),
          reject: () => resolve(null),
        });
      });
    }

    isRefreshing = true;

    return (async () => {
      try {
        const storedRefreshToken = await getRefreshToken();
        if (!storedRefreshToken) {
          processQueue(new Error('No refresh token'), null);
          return null;
        }

        const data = await callRefreshEndpoint(storedRefreshToken);

        // Persist new tokens (refresh endpoint returns "accessToken", not "token")
        await setAuthToken(data.accessToken);
        await setRefreshToken(data.refreshToken);
        await setTokenExpiresAt(Date.now() + data.expiresIn * 1000);

        processQueue(null, data.accessToken);
        notifyListeners();

        return data.accessToken;
      } catch (error) {
        console.error('[tokenRefresh] Refresh failed:', error);
        processQueue(error, null);

        // Only a definitive rejection from the backend (401/403 — this
        // refresh token is invalid, expired, or revoked) means the user is
        // actually signed out and local credentials should be wiped. A
        // network error, timeout, or 5xx just means we couldn't PROVE the
        // session is still good right now — the refresh token in storage may
        // still be perfectly valid, so leave it there for the next attempt
        // instead of forcing a full re-login over a flaky connection.
        const isRejected =
          error instanceof RefreshRejectedError &&
          (error.status === 401 || error.status === 403);
        if (isRejected) {
          try { await clearAuthData(); } catch {}
        }

        return null;
      } finally {
        isRefreshing = false;
      }
    })();
  },

  /**
   * Proactively refresh the token if it's about to expire.
   * Call this before making authenticated API requests.
   * Returns the current (or newly refreshed) access token, or null if refresh fails.
   */
  async ensureFreshToken(): Promise<void> {
    const expiresAt = await getTokenExpiresAt();
    if (!expiresAt) return;

    const timeUntilExpiry = expiresAt - Date.now();
    if (timeUntilExpiry > PROACTIVE_REFRESH_BUFFER_MS) return;

    // Token is about to expire or already expired — refresh it
    await this.attemptRefresh();
  },

  /**
   * Subscribe to token refresh events.
   * Useful for WebSocket connections that need to update auth immediately.
   * Returns an unsubscribe function.
   */
  onTokenRefreshed(listener: TokenRefreshListener): () => void {
    onTokenRefreshedListeners.push(listener);
    return () => {
      onTokenRefreshedListeners = onTokenRefreshedListeners.filter((fn) => fn !== listener);
    };
  },
};
