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

type PromptListener = (category: string | undefined) => void;

const promptListeners = new Set<PromptListener>();

/**
 * The prompt flow lives on its own screen, but the category it produces has to
 * land on the already-mounted HomeScreen. HomeScreen only reads the persisted
 * category once on mount, so writing to MMKV alone would not take effect until
 * the next cold start — hence this channel.
 */
export const promptFeedEvents = {
  /** Subscribe to feed prompt results. Returns unsubscribe function. */
  onCategoryChosen(listener: PromptListener): () => void {
    promptListeners.add(listener);
    return () => { promptListeners.delete(listener); };
  },

  /** Apply a category chosen by the prompt flow. `undefined` means "All". */
  chooseCategory(category: string | undefined): void {
    promptListeners.forEach((fn) => fn(category));
  },
};
