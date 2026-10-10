export interface CloudProjectSavedEvent { wallet: string; owner: string; projectId: string; revision: number }
const listeners = new Set<(event: CloudProjectSavedEvent) => void>();
export function onCloudProjectSaved(listener: (event: CloudProjectSavedEvent) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
/** An observer cannot turn a completed save into a failed save. */
export function notifyCloudProjectSaved(event: CloudProjectSavedEvent) { for (const listener of listeners) { try { listener(event); } catch { /* the saved revision is already durable */ } } }
export interface CloudProjectDraftEvent extends CloudProjectSavedEvent {draftRevision:number}
const draftListeners=new Set<(event:CloudProjectDraftEvent)=>void>();
export function onCloudProjectDraftStored(listener:(event:CloudProjectDraftEvent)=>void){draftListeners.add(listener);return ()=>{draftListeners.delete(listener);};}
export function notifyCloudProjectDraftStored(event:CloudProjectDraftEvent){for(const listener of draftListeners){try{listener(event);}catch{/* durable checkpoint */}}}
