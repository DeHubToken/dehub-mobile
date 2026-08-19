import * as SecureStore from 'expo-secure-store';
import { clearAllEngagement } from './engagementCache';
import { clearLinkCopyFloors } from './link-copy-floors';
import { clearUnlockedTokens } from './unlocked-tokens';
import { queryClient } from '../config/queryClient';

// Storage keys
export const AUTH_USER_KEY = 'auth_user';
export const AUTH_TOKEN_KEY = 'auth_token';
export const HAS_SEEN_AUTH_KEY = 'has_seen_auth';
export const HAS_SEEN_ONBOARDING_KEY = 'has_seen_onboarding';
export const WEB3_PROVIDER_KEY = 'web3_provider_info';
export const AUTH_METHOD_KEY = 'auth_method';
export const AUTH_METHOD_ADDR_KEY = 'auth_method_address';
export const PREFERRED_CHAIN_ID_KEY = 'preferred_chain_id';
export const PENDING_CHAIN_SWITCH_KEY = 'pending_chain_switch';
export const REFRESH_TOKEN_KEY = 'auth_refresh_token';
export const TOKEN_EXPIRES_AT_KEY = 'auth_token_expires_at';
/** Tags which Supabase identity produced the current DeHub session (dehubweb: dehub_supabase_uid). */
export const SUPABASE_UID_KEY = 'auth_supabase_uid';

/**
 * Gets the authentication token from SecureStore
 */
export async function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(AUTH_TOKEN_KEY);
}

/**
 * Sets the authentication token in SecureStore
 */
export async function setAuthToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
}

/**
 * Removes the authentication token from SecureStore
 */
export async function removeAuthToken(): Promise<void> {
  return SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
}

/**
 * Gets the refresh token from SecureStore
 */
export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

/**
 * Sets the refresh token in SecureStore
 */
export async function setRefreshToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

/**
 * Removes the refresh token from SecureStore
 */
export async function removeRefreshToken(): Promise<void> {
  return SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

/**
 * Gets the token expiration timestamp (epoch ms) from SecureStore
 */
export async function getTokenExpiresAt(): Promise<number | null> {
  const value = await SecureStore.getItemAsync(TOKEN_EXPIRES_AT_KEY);
  return value ? Number(value) : null;
}

/**
 * Sets the token expiration timestamp (epoch ms) in SecureStore
 */
export async function setTokenExpiresAt(expiresAt: number): Promise<void> {
  return SecureStore.setItemAsync(TOKEN_EXPIRES_AT_KEY, String(expiresAt));
}

/**
 * Removes the token expiration timestamp from SecureStore
 */
export async function removeTokenExpiresAt(): Promise<void> {
  return SecureStore.deleteItemAsync(TOKEN_EXPIRES_AT_KEY);
}

export async function getStoredSupabaseUserId(): Promise<string | null> {
  return SecureStore.getItemAsync(SUPABASE_UID_KEY);
}

export async function setStoredSupabaseUserId(userId: string): Promise<void> {
  return SecureStore.setItemAsync(SUPABASE_UID_KEY, userId);
}

export async function clearStoredSupabaseUserId(): Promise<void> {
  return SecureStore.deleteItemAsync(SUPABASE_UID_KEY);
}

/**
 * Gets the authenticated user data from SecureStore
 */
export async function getAuthUser<T = any>(): Promise<T | null> {
  const userData = await SecureStore.getItemAsync(AUTH_USER_KEY);
  if (userData) {
    return JSON.parse(userData);
  }
  return null;
}

/**
 * Essential user fields to persist in SecureStore (keep under 2KB limit)
 */
const ESSENTIAL_USER_FIELDS = [
  '_id',
  'address',
  'walletAddress', 
  'username',
  'displayName',
  'bio',
  'avatarImageUrl',
  'avatarUrl',
  'bannerImageUrl',
  'bannerUrl',
  'isCreator',
  'isVerified',
  'followersCount',
  'followingCount',
  'notificationCount',
  'socialLinks',
  'createdAt',
] as const;

/**
 * Sets the authenticated user data in SecureStore
 * Only stores essential fields to stay under the 2KB limit
 */
export async function setAuthUser<T = any>(user: T): Promise<void> {
  if (!user || typeof user !== 'object') {
    return SecureStore.setItemAsync(AUTH_USER_KEY, JSON.stringify(user));
  }
  
  // Extract only essential fields to keep storage size minimal
  const essentialUser: Record<string, any> = {};
  for (const field of ESSENTIAL_USER_FIELDS) {
    if ((user as any)[field] !== undefined) {
      essentialUser[field] = (user as any)[field];
    }
  }
  
  return SecureStore.setItemAsync(AUTH_USER_KEY, JSON.stringify(essentialUser));
}

/**
 * Removes the authenticated user data from SecureStore
 */
export async function removeAuthUser(): Promise<void> {
  return SecureStore.deleteItemAsync(AUTH_USER_KEY);
}

/**
 * Checks if the user has seen the auth screens
 */
export async function hasSeenAuth(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(HAS_SEEN_AUTH_KEY);
  return value === 'true';
}

/**
 * Sets that the user has seen the auth screens
 */
export async function setHasSeenAuth(): Promise<void> {
  return SecureStore.setItemAsync(HAS_SEEN_AUTH_KEY, 'true');
}

/**
 * Checks if the user has completed onboarding
 */
export async function hasSeenOnboarding(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(HAS_SEEN_ONBOARDING_KEY);
  return value === 'true';
}

/**
 * Sets that the user has completed onboarding
 */
export async function setHasSeenOnboarding(): Promise<void> {
  return SecureStore.setItemAsync(HAS_SEEN_ONBOARDING_KEY, 'true');
}

/**
 * DEV ONLY: Resets onboarding/auth flags to simulate first-time user
 * Call this from console or a dev button to test onboarding flow
 */
export async function __DEV_resetOnboardingFlags(): Promise<void> {
  await SecureStore.deleteItemAsync(HAS_SEEN_AUTH_KEY);
  await SecureStore.deleteItemAsync(HAS_SEEN_ONBOARDING_KEY);
  console.log('[DEV] Onboarding flags reset - restart app to see onboarding');
}

/**
 * Clears all authentication data from SecureStore
 */
export async function clearAuthData(): Promise<void> {
  // Drop this account's optimistic like/save/repost overlay, otherwise it would
  // keep beating the next account's server state for the full TTL.
  try { clearAllEngagement(); } catch {}
  // Same for the link-copy floor: the next account has not copied anything.
  try { clearLinkCopyFloors(); } catch {}
  // Session PPV unlocks are per-account too.
  try { clearUnlockedTokens(); } catch {}
  // The feed query caches are viewer-shaped (isLiked/isSaved ride in the
  // items), keyed without a viewer, and MMKV-persisted for 24h — clearing here
  // is what stops one account's engagement state painting for the next.
  try { queryClient.clear(); } catch {}
  await removeAuthToken();
  await removeRefreshToken();
  await removeTokenExpiresAt();
  await removeAuthUser();
  await SecureStore.deleteItemAsync(WEB3_PROVIDER_KEY);
  try { await SecureStore.deleteItemAsync(AUTH_METHOD_KEY); } catch {}
  try { await SecureStore.deleteItemAsync(AUTH_METHOD_ADDR_KEY); } catch {}
  try { await SecureStore.deleteItemAsync(PREFERRED_CHAIN_ID_KEY); } catch {}
  try { await SecureStore.deleteItemAsync(PENDING_CHAIN_SWITCH_KEY); } catch {}
  try { await clearStoredSupabaseUserId(); } catch {}
}

/**
 * Utility function to create Authorization headers for API requests
 */
export async function createAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  if (token) {
    return {
      'Authorization': `Bearer ${token}`,
    };
  }
  return {};
}

/**
 * Validates if a token is expired
 * @param token - JWT token to validate
 * @returns boolean indicating if the token is expired
 */
export function isTokenExpired(token: string): boolean {
  if (!token) return true;
  
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return true;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    
    const { exp } = JSON.parse(jsonPayload);
    return exp * 1000 < Date.now();
  } catch (error) {
    // If token is not a valid JWT or doesn't have an exp claim
    return true;
  }
}

// We avoid serializing full provider objects (non-serializable, circular). Instead store
// minimal connection metadata (e.g., chainId, timestamp) to decide whether a fresh init is needed.

export interface StoredProviderMeta {
  chainId?: number;
  storedAt: number; // epoch ms
}

export async function setStoredProviderMeta(meta: StoredProviderMeta): Promise<void> {
  try {
    await SecureStore.setItemAsync(WEB3_PROVIDER_KEY, JSON.stringify(meta));
  } catch {}
}

export async function getStoredProviderMeta(): Promise<StoredProviderMeta | null> {
  try {
    const raw = await SecureStore.getItemAsync(WEB3_PROVIDER_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearStoredProviderMeta(): Promise<void> {
  try { await SecureStore.deleteItemAsync(WEB3_PROVIDER_KEY); } catch {}
}

export type AuthMethod = 'local';

export async function setAuthMethod(method: AuthMethod, address?: string | null): Promise<void> {
  try {
    await SecureStore.setItemAsync(AUTH_METHOD_KEY, method);
  } catch {}
  if (address) {
    try { await SecureStore.setItemAsync(AUTH_METHOD_ADDR_KEY, address.toLowerCase()); } catch {}
  }
}

export async function getAuthMethod(): Promise<{ method: AuthMethod | null; address: string | null; }> {
  try {
    const [m, a] = await Promise.all([
      SecureStore.getItemAsync(AUTH_METHOD_KEY),
      SecureStore.getItemAsync(AUTH_METHOD_ADDR_KEY),
    ]);
    const method = m === 'local' ? (m as AuthMethod) : null;
    return { method, address: a || null };
  } catch {
    return { method: null, address: null };
  }
}

export async function clearAuthMethod(): Promise<void> {
  try { await SecureStore.deleteItemAsync(AUTH_METHOD_KEY); } catch {}
  try { await SecureStore.deleteItemAsync(AUTH_METHOD_ADDR_KEY); } catch {}
}

export async function setPreferredChainId(id: number): Promise<void> {
  try { await SecureStore.setItemAsync(PREFERRED_CHAIN_ID_KEY, String(id)); } catch {}
}

export async function getPreferredChainId(): Promise<number | null> {
  try {
    const raw = await SecureStore.getItemAsync(PREFERRED_CHAIN_ID_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  } catch { return null; }
}

export async function setPendingChainSwitch(chainId: number): Promise<void> {
  try { await SecureStore.setItemAsync(PENDING_CHAIN_SWITCH_KEY, String(chainId)); } catch {}
}

export async function getPendingChainSwitch(): Promise<number | null> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_CHAIN_SWITCH_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  } catch { return null; }
}

export async function clearPendingChainSwitch(): Promise<void> {
  try { await SecureStore.deleteItemAsync(PENDING_CHAIN_SWITCH_KEY); } catch {}
}

/**
 * Clears the cached auth signature from the stored user object.
 * This forces getOrCreateAuthSignature to generate a fresh signature.
 */
export async function clearAuthSignature(): Promise<void> {
  try {
    const userData = await SecureStore.getItemAsync(AUTH_USER_KEY);
    if (!userData) return;
    const user = JSON.parse(userData);
    if (user?.authSignature) {
      delete user.authSignature;
      await SecureStore.setItemAsync(AUTH_USER_KEY, JSON.stringify(user));
    }
  } catch {}
}
