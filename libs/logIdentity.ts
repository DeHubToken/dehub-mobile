import * as SecureStore from 'expo-secure-store';

/** Read the existing session before React mounts or startup crash reports flush. */
export function readLogIdentity(): string | null {
  try {
    const raw = SecureStore.getItem('auth_user');
    const user = raw ? JSON.parse(raw) : null;
    const address = user?.walletAddress || user?.address;
    return typeof address === 'string' && address ? address.toLowerCase() : null;
  } catch {
    return null;
  }
}
