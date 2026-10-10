const transfers = new Set<string>();
const listeners=new Map<string,Set<()=>void>>();
export class CloudProjectTransferBusy extends Error {}
export const isCloudProjectTransferBusy=(wallet:string)=>transfers.has(wallet.toLowerCase());
export function onCloudProjectTransferSettled(wallet:string,listener:()=>void){
  const key=wallet.toLowerCase();let group=listeners.get(key);if(!group){group=new Set();listeners.set(key,group);}group.add(listener);
  return ()=>{group!.delete(listener);if(!group!.size)listeners.delete(key);};
}

/** Saved versions, received changes and draft requests share the same lock. */
export async function withCloudProjectTransfer<T>(wallet: string, check: () => void, action: () => Promise<T>): Promise<T> {
  const key = wallet.toLowerCase();
  if (transfers.has(key)) throw new CloudProjectTransferBusy("A cloud project operation is already running");
  check(); transfers.add(key);
  try { return await action(); } finally { transfers.delete(key);for(const listener of listeners.get(key)||[]){try{listener();}catch{/* completed transfer */}} }
}
