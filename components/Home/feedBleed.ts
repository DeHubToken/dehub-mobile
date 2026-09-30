import { createContext, useContext, useEffect } from "react";
import type { IconName } from "../ui/Icon";

/** One control a player hands up to the card's tools menu. */
export type MediaTool = {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Drawn highlighted (a toggle that is on). */
  active?: boolean;
};

/**
 * Set by a feed card whose media runs edge to edge with its own chrome laid
 * over it (the system theme's home feed). The media components read it to
 * drop their card inset and corner radius, and to keep their own overlays
 * clear of that chrome: `topInset` is the band the author and buttons take
 * along the top, `bottomInset` the band they take along the bottom when they
 * sit there instead (the feed's first post, under the capsule).
 *
 * `setTools` is how a player folds its own buttons (speed, loop, sound,
 * subtitles, picture in picture, full screen) into the card's single tools
 * menu instead of drawing them over the picture.
 */
export type FeedBleed = {
  topInset: number;
  bottomInset?: number;
  setTools?: (tools: MediaTool[] | null) => void;
};

export const FeedBleedContext = createContext<FeedBleed | null>(null);

export const useFeedBleed = () => useContext(FeedBleedContext);

/** Hands `tools` to the card's tools menu while mounted; a no-op elsewhere. */
export function useMediaTools(tools: MediaTool[] | null) {
  const setTools = useFeedBleed()?.setTools;
  useEffect(() => {
    if (!setTools) return;
    setTools(tools);
  }, [setTools, tools]);
  useEffect(() => {
    if (!setTools) return;
    return () => setTools(null);
  }, [setTools]);
}
