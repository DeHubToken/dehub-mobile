import { useSyncExternalStore } from "react";
export interface DesignColourPick { projectId: string; token: number; pending: boolean; error: string }
let current: DesignColourPick | null = null, nextToken = 0, receive: ((colour: string) => void) | null = null;
const listeners = new Set<() => void>();
function publish(value: DesignColourPick | null) { current = value; for (const listener of listeners) listener(); }
export function getDesignColourPick() { return current; }
export function subscribeDesignColourPick(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useDesignColourPick() { return useSyncExternalStore(subscribeDesignColourPick, getDesignColourPick, getDesignColourPick); }
export function startDesignColourPick(projectId: string, onPick: (colour: string) => void): number {
  const token = ++nextToken; receive = onPick; publish({ projectId, token, pending: false, error: "" }); return token;
}
export function cancelDesignColourPick(token?: number): void { if (!current || token !== undefined && token !== current.token) return; receive = null; publish(null); }
export function beginDesignColourSample(projectId: string): number | null {
  if (!current || current.projectId !== projectId || current.pending) return null;
  const token = current.token; publish({ ...current, pending: true, error: "" }); return token;
}
export function finishDesignColourSample(token: number, colour: string | null, error = ""): void {
  if (current?.token !== token) return;
  if (!colour || !/^#[a-f\d]{6}$/i.test(colour)) { publish({ ...current, pending: false, error: error || "Could not sample this colour. Choose another point or cancel." }); return; }
  const onPick = receive; cancelDesignColourPick(token); onPick?.(colour.toLowerCase());
}
