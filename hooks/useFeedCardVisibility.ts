import { useCallback, useMemo, useRef, useState } from "react";
import type { ViewToken } from "react-native";
import { isVideoItem, isLiveItem } from "../services/feed.unified.service";

function getListItemKey(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const row = item as { key?: string; __listKey?: string };
  return row.key ?? row.__listKey ?? null;
}

type KeyExtractor = (item: unknown, index: number) => string;

/**
 * Tracks two separate things about a list's rows, which used to be one flag.
 *
 * - `isItemVisible` — the row is on screen. Decides whether FeedCard /
 *   FeedVideoPlayer may hold a native player at all (avoids OOM on profile
 *   lists, where the render window is a dozen rows deep).
 * - `isItemAutoplayActive` — this is the single video row the scroll position
 *   has handed autoplay to.
 *
 * They were the same value: `isItemVisible` returned `activeVideoKey === key`
 * for video rows, so the second video on screen was told it was off screen. It
 * could not attach a media source, so tapping it did nothing whatsoever and
 * the feed looked stuck on whichever video started first. Only *autoplay* is
 * exclusive; a tap may start any row the viewer can actually see.
 */
export function useFeedCardVisibility(keyExtractor?: KeyExtractor) {
  const [visibleItemKeys, setVisibleItemKeys] = useState<Set<string>>(new Set());
  const [activeVideoKey, setActiveVideoKey] = useState<string | null>(null);
  const keyExtractorRef = useRef(keyExtractor);
  keyExtractorRef.current = keyExtractor;

  const resolveKey = useCallback((item: unknown, index?: number | null) => {
    if (keyExtractorRef.current && index != null) {
      return keyExtractorRef.current(item, index);
    }
    return getListItemKey(item);
  }, []);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    // Was 0, so a fling fired this callback — and the two setStates below, and
    // the list re-render they cause — on essentially every frame it crossed a
    // row boundary. 150ms matches the Home feed and means only rows the user
    // actually dwelled on move the visibility set.
    minimumViewTime: 150,
  }).current;

  const onViewableItemsChanged = useRef(
    ({
      viewableItems,
      changed,
    }: {
      viewableItems: ViewToken[];
      changed: ViewToken[];
    }) => {
      setVisibleItemKeys((prev) => {
        let membershipChanged = false;
        const next = new Set(prev);
        for (const entry of changed) {
          const key = resolveKey(entry.item, entry.index);
          if (!key) continue;
          if (entry.isViewable) {
            if (!prev.has(key)) {
              next.add(key);
              membershipChanged = true;
            }
          } else if (prev.has(key)) {
            next.delete(key);
            membershipChanged = true;
          }
        }
        return membershipChanged ? next : prev;
      });

      // Autoplay belongs to the topmost row that can actually hold a video.
      // Sorting over every viewable row handed it to whatever text or image
      // post happened to sit above the video, and then no video autoplayed at
      // all — the "sometimes it just doesn't start" half of the same bug.
      //
      // A live post holds a player too. It is not a "video" item — postType is
      // "live", which routes it to the in-card stream preview — so this filter
      // excluded it and no live card was ever handed autoplay in any feed that
      // tracks visibility. It could only play in the lists that pass no flags
      // at all and inherit `true`.
      const topVideo = viewableItems
        .filter(
          (v) =>
            v.isViewable &&
            (isVideoItem(v.item as any) || isLiveItem(v.item as any)) &&
            resolveKey(v.item, v.index),
        )
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))[0];
      setActiveVideoKey(
        topVideo ? resolveKey(topVideo.item, topVideo.index) : null,
      );
    },
  ).current;

  const isItemVisible = useCallback(
    (key: string) => visibleItemKeys.has(key),
    [visibleItemKeys],
  );

  /** The one video row allowed to start itself while the list is scrolled. */
  const isItemAutoplayActive = useCallback(
    (key: string) => activeVideoKey === key,
    [activeVideoKey],
  );

  // Memoised: as a bare array literal this changed identity on every render of
  // the consumer, so passing it as FlatList `extraData` re-rendered every
  // mounted cell whether or not visibility had actually moved.
  const visibilityExtraData = useMemo(
    () => ({ visibleItemKeys, activeVideoKey }),
    [visibleItemKeys, activeVideoKey],
  );

  return {
    viewabilityConfig,
    onViewableItemsChanged,
    isItemVisible,
    isItemAutoplayActive,
    visibilityExtraData,
  };
}

export default useFeedCardVisibility;
