import * as SecureStore from 'expo-secure-store';

// Storage keys
export const AUTH_USER_KEY = 'auth_user';
export const AUTH_TOKEN_KEY = 'auth_token';
export const HAS_SEEN_AUTH_KEY = 'has_seen_auth';

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
 * Sets the authenticated user data in SecureStore
 */
export async function setAuthUser<T = any>(user: T): Promise<void> {
  return SecureStore.setItemAsync(AUTH_USER_KEY, JSON.stringify(user));
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
 * Clears all authentication data from SecureStore
 */
export async function clearAuthData(): Promise<void> {
  await removeAuthToken();
  await removeAuthUser();
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
