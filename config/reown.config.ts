import { useSyncExternalStore } from 'react';
import env from './env';
import type { createAppKit } from '@reown/appkit-ethers5-react-native';
type Kit = ReturnType<typeof createAppKit>;
export const isWalletConnectAvailable = !!env.REOWN_PROJECT_ID;
const listeners = new Set<() => void>();
let pending: Promise<Kit | undefined> | undefined;
export function getAppKitInstance(): Kit | undefined {
  return (globalThis as any).__REOWN_APPKIT_INSTANCE__;
}
export function ensureAppKit(): Promise<Kit | undefined> {
  if (getAppKitInstance()) return Promise.resolve(getAppKitInstance());
  if (!pending) pending = import('./reown.runtime').then(m => {
    const kit = m.getAppKitInstance();
    if (!kit) throw new Error('Wallet connection is unavailable');
    listeners.forEach(fn => fn());
    return kit;
  }).catch(error => { pending = undefined; throw error; });
  return pending;
}
export function useAppKitReady(): boolean {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => !!getAppKitInstance());
}
