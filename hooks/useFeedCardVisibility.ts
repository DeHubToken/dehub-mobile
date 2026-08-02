import { useCallback, useMemo, useRef, useState } from "react";
import type { ViewToken } from "react-native";
import { isVideoItem } from "../services/feed.unified.service";

function getListItemKey(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const row = item as { key?: string; __listKey?: string };
  return row.key ?? row.__listKey ?? null;
}

type KeyExtractor = (item: unknown, index: number) => string;

/**
 * Tracks which FlatList rows are visible so FeedCard / FeedVideoPlayer only
 * attach a native player for the on-screen item (avoids OOM on profile lists).
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

      const topItem = viewableItems
        .filter((v) => v.isViewable && resolveKey(v.item, v.index))
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))[0];
      setActiveVideoKey(
        topItem ? resolveKey(topItem.item, topItem.index) : null,
      );
    },
  ).current;

  const isItemVisible = useCallback(
    (key: string, item?: unknown) => {
      if (item && isVideoItem(item as any)) {
        return activeVideoKey === key;
      }
      return visibleItemKeys.has(key);
    },
    [visibleItemKeys, activeVideoKey],
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
    visibilityExtraData,
  };
}

export default useFeedCardVisibility;
