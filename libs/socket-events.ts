type Handler = (data: any) => void;
type Subscribe = (event: string, handler: Handler) => () => void;

/**
 * Socket subscriptions for code that lives outside React — the upload queue
 * and the draft video uploader. WebSocketProvider binds its `on` here when it
 * mounts; anything subscribed before that (or while signed out) is held and
 * attached once it does, the same way the provider holds its own.
 */
let bound: Subscribe | null = null;
const subs = new Set<{ event: string; handler: Handler; detach?: () => void }>();

export function bindSocketEvents(subscribe: Subscribe): () => void {
  bound = subscribe;
  subs.forEach((sub) => {
    sub.detach?.();
    sub.detach = subscribe(sub.event, sub.handler);
  });
  return () => {
    if (bound !== subscribe) return;
    bound = null;
    subs.forEach((sub) => {
      sub.detach?.();
      sub.detach = undefined;
    });
  };
}

/** Listen for a server event. Returns the unsubscribe. */
export function onSocketEvent(event: string, handler: Handler): () => void {
  const sub: { event: string; handler: Handler; detach?: () => void } = { event, handler };
  subs.add(sub);
  if (bound) sub.detach = bound(event, handler);
  return () => {
    try { sub.detach?.(); } catch {}
    subs.delete(sub);
  };
}
