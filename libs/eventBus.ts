type Listener = () => void;

const listeners = new Set<Listener>();

export const feedEvents = {
  /** Subscribe to feed refresh requests. Returns unsubscribe function. */
  onRefreshRequested(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },

  /** Request the feed to refresh (called after a new post is uploaded). */
  requestRefresh(): void {
    listeners.forEach((fn) => fn());
  },
};
