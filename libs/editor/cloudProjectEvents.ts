export interface CloudProjectSavedEvent { wallet: string; owner: string; projectId: string; revision: number }
const listeners = new Set<(event: CloudProjectSavedEvent) => void>();
export function onCloudProjectSaved(listener: (event: CloudProjectSavedEvent) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
/** An observer cannot turn a completed save into a failed save. */
export function notifyCloudProjectSaved(event: CloudProjectSavedEvent) { for (const listener of listeners) { try { listener(event); } catch { /* the saved revision is already durable */ } } }
