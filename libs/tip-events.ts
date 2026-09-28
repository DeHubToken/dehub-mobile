/**
 * Post-tip broadcast. The tip sheet knows a tip landed; the action bar that
 * opened it does not. One tiny pub/sub keeps the two independent.
 */
type Listener = (tokenId: string) => void;
const listeners = new Set<Listener>();

export function emitPostTipped(tokenId: string | number): void {
  const id = String(tokenId);
  listeners.forEach((fn) => fn(id));
}

export function subscribePostTipped(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
