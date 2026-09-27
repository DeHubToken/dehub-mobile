import { useSyncExternalStore } from 'react';
import { isKidsModeLocked, onKidsModeChange } from '../libs/kids-mode-lock';

/**
 * Just the answer: is this device in Kids Mode. Subscribes to the device lock
 * alone — no auth context or queries — so list rows and pickers can read it
 * cheaply, and it is correct on the first render.
 */
export function useKidsModeLock(): boolean {
  return useSyncExternalStore(onKidsModeChange, isKidsModeLocked, isKidsModeLocked);
}
