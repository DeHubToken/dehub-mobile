import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import StoryViewerModal from "../components/Story/StoryViewerModal";
import type { Story } from "../services/stories.service";

export interface OpenStoriesOptions {
  initialIndex?: number;
  viewerWalletAddress?: string;
  onStoryShown?: (story: Story) => void;
  onStoriesChanged?: () => void;
}

interface StoryViewerContextValue {
  openStories: (stories: Story[], options?: OpenStoriesOptions) => void;
  closeStories: () => void;
}

const StoryViewerContext = createContext<StoryViewerContextValue | null>(null);

export const StoryViewerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [initialIndex, setInitialIndex] = useState(0);
  const [viewerWalletAddress, setViewerWalletAddress] = useState<string | undefined>();
  const [onStoryShown, setOnStoryShown] = useState<((story: Story) => void) | undefined>();
  const [onStoriesChanged, setOnStoriesChanged] = useState<(() => void) | undefined>();

  const openStories = useCallback((items: Story[], options?: OpenStoriesOptions) => {
    if (!items.length) return;
    setStories(items);
    setInitialIndex(options?.initialIndex ?? 0);
    setViewerWalletAddress(options?.viewerWalletAddress);
    setOnStoryShown(() => options?.onStoryShown);
    setOnStoriesChanged(() => options?.onStoriesChanged);
    setVisible(true);
  }, []);

  const closeStories = useCallback(() => setVisible(false), []);

  // Both functions are stable, but the object around them was not: a bare
  // literal here gave the context a new identity on each of the six state
  // updates above, so opening or closing a story re-rendered every
  // useStoryViewer() consumer in the app for no change at all.
  const value = useMemo(
    () => ({ openStories, closeStories }),
    [openStories, closeStories],
  );

  return (
    <StoryViewerContext.Provider value={value}>
      {children}
      <StoryViewerModal
        visible={visible}
        stories={stories}
        initialIndex={initialIndex}
        viewerWalletAddress={viewerWalletAddress}
        onClose={closeStories}
        onStoryShown={onStoryShown}
        onStoriesChanged={onStoriesChanged}
      />
    </StoryViewerContext.Provider>
  );
};

export function useStoryViewer(): StoryViewerContextValue {
  const ctx = useContext(StoryViewerContext);
  if (!ctx) {
    throw new Error("useStoryViewer must be used within StoryViewerProvider");
  }
  return ctx;
}
