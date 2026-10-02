import { useSyncExternalStore } from "react";
const refreshing = new Set<symbol>();
const pills = new Set<symbol>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
export function setFeedPillRefreshing(id: symbol, value: boolean) {
  const was = refreshing.size > 0;
  value ? refreshing.add(id) : refreshing.delete(id);
  if (was !== (refreshing.size > 0)) emit();
}
export function setFeedPillMounted(id: symbol, value: boolean) {
  const was = pills.size > 0;
  value ? pills.add(id) : pills.delete(id);
  if (was !== (pills.size > 0)) emit();
}
export const useFeedPillRefreshing = () => useSyncExternalStore(subscribe, () => refreshing.size > 0, () => false);
export const useFeedPillMounted = () => useSyncExternalStore(subscribe, () => pills.size > 0, () => false);
