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
import * as SecureStore from 'expo-secure-store';
import { SUPABASE_UID_KEY, AUTH_METHOD_ADDR_KEY } from './auth.utils';

const API_BASE_URL = env.API_URL;
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const PLATFORM = Platform.OS;

/**
 * Who owns the live session keys right now. Deliberately local and cheap —
 * consulted around every refresh.
 */
async function readSessionOwner(): Promise<{ address: string; uid: string | null } | null> {
  try {
    const address = await SecureStore.getItemAsync(AUTH_METHOD_ADDR_KEY);
    if (!address) return null;
    const uid = await SecureStore.getItemAsync(SUPABASE_UID_KEY);
    return { address: address.toLowerCase(), uid };
  } catch {
    return null;
  }
}

function sameSessionOwner(
  owner: Awaited<ReturnType<typeof readSessionOwner>>,
  now: Awaited<ReturnType<typeof readSessionOwner>>
): boolean {
  if (!owner || !now) return owner === now;
  return now.address === owner.address && now.uid === owner.uid;
}

// Buffer before expiry to trigger proactive refresh (60 seconds)
const PROACTIVE_REFRESH_BUFFER_MS = 60 * 1000;

type QueueEntry = {
  resolve: (token: string) => void;
  reject: (error: any) => void;
};

type TokenRefreshListener = () => void;

/**
 * Ceiling on a single refresh.
 *
 * React Native's `fetch` has no default timeout, and a phone drops sockets
 * without closing them — a wifi-to-cellular handover, a sleeping radio, a
 * captive portal. The request then never settles, and because this one
 * promise gates every authenticated call in the app, neither does anything
 * else: the feed stops updating and sign-in spins forever with no error to
 * show for it, because nothing ever failed. Bounding the request is what
 * turns that into an ordinary retryable failure.
 *
 * An abort has no `.status`, so the catch below treats it as "couldn't prove
 * the session right now" and leaves stored credentials alone — a slow network
 * must not sign anyone out.
 */
const REFRESH_TIMEOUT_MS = 20_000;

/**
 * How long the flag may stay up before it is assumed dead. Above the request
 * ceiling with room for the storage reads either side of it, so a genuinely
 * slow refresh is waited out rather than duplicated.
 */
const REFRESH_STUCK_AFTER_MS = REFRESH_TIMEOUT_MS + 15_000;

let isRefreshing = false;
/** When the in-flight refresh began, for the stuck check above. */
let refreshStartedAt = 0;
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
  // AbortController is optional here only because the test environment and
  // older runtimes may not provide one; where it exists the request is bounded,
  // and where it does not this behaves exactly as it did before.
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS)
    : null;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Client-Type': 'mobile',
        'X-Platform': PLATFORM,
        'X-App-Version': APP_VERSION,
      },
      body: JSON.stringify({ refreshToken }),
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error) {
    if (controller?.signal.aborted) {
      // No `.status`: the session may well still be good, so the caller keeps
      // the stored credentials and the next call tries again.
      throw new Error(`Refresh timed out after ${REFRESH_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }

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
    // A flag that has been up longer than a refresh can possibly take belongs
    // to one that died without settling — before the timeout above existed,
    // that was permanent, and every caller after it queued behind a promise
    // nobody would ever resolve. Waiters are released with a failure and this
    // call starts a new attempt rather than joining the dead one.
    if (isRefreshing && Date.now() - refreshStartedAt > REFRESH_STUCK_AFTER_MS) {
      console.warn('[tokenRefresh] Previous refresh never settled; starting a new one');
      isRefreshing = false;
      processQueue(new Error('Refresh abandoned'), null);
    }

    if (isRefreshing) {
      return new Promise<string | null>((resolve, reject) => {
        failedQueue.push({
          resolve: (token) => resolve(token),
          reject: () => resolve(null),
        });
      });
    }

    isRefreshing = true;
    refreshStartedAt = Date.now();

    // Captured before the request: the response lands an unknown time later —
    // long enough for a profile switch to replace the live keys. Writing the
    // rotated pair blindly then would graft this account's tokens onto whoever
    // owns the session by then, and every later call would fail with a blended
    // identity. Declared out here so the rejection branch below can see it.
    let ownerAtStart: Awaited<ReturnType<typeof readSessionOwner>> = null;

    return (async () => {
      try {
        const storedRefreshToken = await getRefreshToken();
        if (!storedRefreshToken) {
          processQueue(new Error('No refresh token'), null);
          return null;
        }

        ownerAtStart = await readSessionOwner();

        const data = await callRefreshEndpoint(storedRefreshToken);

        const ownerNow = await readSessionOwner();
        if (sameSessionOwner(ownerAtStart, ownerNow)) {
          // Persist new tokens (refresh endpoint returns "accessToken", not "token")
          await setAuthToken(data.accessToken);
          await setRefreshToken(data.refreshToken);
          await setTokenExpiresAt(Date.now() + data.expiresIn * 1000);
        } else {
          // The keys changed hands mid-flight. File the pair into the OLD
          // account's stored profile so switching back to it restores a chain
          // the server still honours; writing to the live keys instead would
          // blend two identities.
          try {
            const { mergeTokensIntoStoredProfile } = await import('./profiles');
            if (ownerAtStart) {
              await mergeTokensIntoStoredProfile(ownerAtStart, {
                auth_token: data.accessToken,
                ...(data.refreshToken ? { auth_refresh_token: data.refreshToken } : {}),
                ...(data.expiresIn
                  ? { auth_token_expires_at: String(Date.now() + data.expiresIn * 1000) }
                  : {}),
              });
            }
          } catch {}
        }

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
          // Only wipe when the live keys still belong to whoever started this
          // refresh — a revoke landing after a profile switch must not take
          // the incoming account's fresh keys down with it.
          const ownerNow = await readSessionOwner();
          if (sameSessionOwner(ownerAtStart, ownerNow)) {
            try {
              await clearAuthData();
            } catch {}
          }
        }

        return null;
      } finally {
        isRefreshing = false;
        // Both paths above drain the queue already. This is the backstop for
        // the one that gets added later and forgets to: a waiter left here is
        // a caller hanging forever, which is the failure this whole change is
        // about.
        if (failedQueue.length) processQueue(new Error('Refresh ended without a result'), null);
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
