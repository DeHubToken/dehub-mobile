import { createContext, useContext } from "react";

/**
 * Feed comment taps on phones open the half-screen (Pill Split) comments
 * sheet right over the feed. The feed slides the tapped post up under the top
 * chrome first, so it stays in view above the sheet, the same picture as a
 * post page with its comments open.
 *
 * Provided per row by the Home feed. A card without it (profiles, search)
 * keeps the full comments drawer.
 */
export interface FeedSplitComments {
  /** Slide this row's top up (or down) to just under the top chrome. */
  bringToTop: () => void;
}

export const FeedSplitCommentsContext = createContext<FeedSplitComments | null>(null);

export const useFeedSplitComments = () => useContext(FeedSplitCommentsContext);
