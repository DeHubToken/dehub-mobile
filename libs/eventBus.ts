/**
 * `quiet` is a refresh nobody asked for on screen: a post of the reader's own
 * just went through. Lists fetch it in without the pull-to-refresh spinner,
 * a new shorts draw or a fresh shuffle, and leave a reader who has scrolled
 * away where they are.
 */
export type FeedRefreshRequest = { quiet?: boolean };
type Listener = (request: FeedRefreshRequest) => void;

const listeners = new Set<Listener>();

export const feedEvents = {
  /** Subscribe to feed refresh requests. Returns unsubscribe function. */
  onRefreshRequested(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },

  /** Request the feed to refresh (called after a new post is uploaded). */
  requestRefresh(request: FeedRefreshRequest = {}): void {
    listeners.forEach((fn) => fn(request));
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

let visibleHomeTab = "all";

/** HomeScreen stays mounted under the tab navigator and reports which feed tab is on screen. */
export const homeTabEvents = {
  /** HomeScreen reports the tab on screen so the + button can open the composer on Livestream from Live. */
  setVisibleTab(tab: string): void {
    visibleHomeTab = tab;
  },

  visibleTab(): string {
    return visibleHomeTab;
  },
};
