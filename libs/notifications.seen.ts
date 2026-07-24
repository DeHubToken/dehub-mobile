import AsyncStorage from '@react-native-async-storage/async-storage';

type Listener = (hasUnseen: boolean) => void;
const listeners = new Set<Listener>();

const PREFIX = 'notif-flags';
const keyLastSeen = (addr: string) => `${PREFIX}:lastSeenTopKey:${addr}`;
const keyLastSeenCount = (addr: string) => `${PREFIX}:lastSeenCount:${addr}`;
const keyLastTop = (addr: string) => `${PREFIX}:lastTopKey:${addr}`;

export async function getLastSeenTopKey(address?: string | null): Promise<string | null> {
  try {
    if (!address) return null;
    const k = keyLastSeen(address.toLowerCase());
    return (await AsyncStorage.getItem(k)) || null;
  } catch {
    return null;
  }
}

export async function setLastSeenTopKey(address: string, topKey: string | null): Promise<void> {
  try {
    const k = keyLastSeen(address.toLowerCase());
    if (!topKey) await AsyncStorage.removeItem(k);
    else await AsyncStorage.setItem(k, topKey);
  } catch {}
}

export async function getLastSeenCount(address?: string | null): Promise<number | null> {
  try {
    if (!address) return null;
    const k = keyLastSeenCount(address.toLowerCase());
    const v = await AsyncStorage.getItem(k);
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function setLastSeenCount(address: string, count: number | null): Promise<void> {
  try {
    const k = keyLastSeenCount(address.toLowerCase());
    if (count == null) await AsyncStorage.removeItem(k);
    else await AsyncStorage.setItem(k, String(count));
  } catch {}
}

export async function getLastTopKey(address?: string | null): Promise<string | null> {
  try {
    if (!address) return null;
    const k = keyLastTop(address.toLowerCase());
    return (await AsyncStorage.getItem(k)) || null;
  } catch {
    return null;
  }
}

export async function setLastTopKey(address: string, topKey: string | null): Promise<void> {
  try {
    const k = keyLastTop(address.toLowerCase());
    if (!topKey) await AsyncStorage.removeItem(k);
    else await AsyncStorage.setItem(k, topKey);
  } catch {}
}

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(hasUnseen: boolean) {
  listeners.forEach((l) => {
    try { l(hasUnseen); } catch {}
  });
}

export async function computeHasUnseen(address: string | null | undefined, notifCount: number | undefined | null): Promise<boolean> {
  if (!address) return false;
  const count = Number(notifCount || 0);
  if (count <= 0) return false;
  const lastSeen = await getLastSeenCount(address);
  if (lastSeen == null) return true; // never seen any
  return count > lastSeen; // unseen if increased since last view
}

// Update helpers for screens
export async function markAllSeenForAddress(address: string | null | undefined, currentCount: number | null | undefined) {
  if (!address) return;
  const addr = address.toLowerCase();
  const count = Number(currentCount || 0);
  await setLastSeenCount(addr, count);
  emit(false);
}

// Hook for components (HomeHeader)
import { useEffect, useState } from 'react';
export function useHasUnseenNotifications(address?: string | null, notifCount?: number | null) {
  const [hasUnseen, setHasUnseen] = useState(false);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const v = await computeHasUnseen(address || null, notifCount ?? 0);
      if (mounted) setHasUnseen(v);
    })();
    const unsub = subscribe((v) => {
      if (mounted) setHasUnseen(v);
    });
    return () => { mounted = false; unsub(); };
  }, [address, notifCount]);
  return hasUnseen;
}
