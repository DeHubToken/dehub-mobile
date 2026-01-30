import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import {
  createPostViewTracker,
  forceFlushBatchViews,
  type TokenId,
} from "../services/view.service";

/**
 * Hook to track post visibility and record views.
 * 
 * Usage:
 * ```tsx
 * const { onViewableItemsChanged, viewabilityConfig } = usePostViewTracking(isSignedIn);
 * 
 * <FlatList
 *   onViewableItemsChanged={onViewableItemsChanged}
 *   viewabilityConfig={viewabilityConfig}
 *   ...
 * />
 * ```
 */
export function usePostViewTracking(isSignedIn: boolean) {
  // Map of tokenId -> tracker instance
  const trackersRef = useRef<Map<string, ReturnType<typeof createPostViewTracker>>>(new Map());
  
  // Flush batch when app goes to background
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        forceFlushBatchViews();
      }
    };
    
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    
    return () => {
      subscription.remove();
      // Cleanup all trackers and flush on unmount
      trackersRef.current.forEach(tracker => tracker.cleanup());
      trackersRef.current.clear();
      forceFlushBatchViews();
    };
  }, []);
  
  // Get or create tracker for a token
  const getTracker = useCallback((tokenId: TokenId) => {
    const key = String(tokenId);
    let tracker = trackersRef.current.get(key);
    if (!tracker) {
      tracker = createPostViewTracker(tokenId, isSignedIn);
      trackersRef.current.set(key, tracker);
    }
    return tracker;
  }, [isSignedIn]);
  
  /**
   * Callback for FlatList's onViewableItemsChanged.
   * Tracks which items are visible and for how long.
   */
  const onViewableItemsChanged = useCallback(({ viewableItems, changed }: {
    viewableItems: Array<{ item: any; isViewable: boolean; key?: string }>;
    changed: Array<{ item: any; isViewable: boolean; key?: string }>;
  }) => {
    // Process changed items
    for (const entry of changed) {
      const tokenId = entry.item?.tokenId || entry.item?.id;
      if (!tokenId) continue;
      
      const tracker = getTracker(tokenId);
      // isViewable from FlatList means the item is in the viewable area
      // We consider this as 50%+ visible for our purposes
      tracker.onVisibilityChange(entry.isViewable ? 0.6 : 0);
    }
  }, [getTracker]);
  
  /**
   * Viewability config for FlatList.
   * Item is considered "viewable" when 50% is visible.
   */
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50, // 50% of item must be visible
    minimumViewTime: 0, // We handle timing ourselves
  }).current;
  
  return {
    onViewableItemsChanged,
    viewabilityConfig,
    getTracker,
  };
}

/**
 * Hook for tracking a single item's visibility.
 * Use this for individual cards that aren't in a FlatList.
 * 
 * Usage:
 * ```tsx
 * const { trackVisibility, cleanup } = useSingleItemViewTracking(tokenId, isSignedIn);
 * 
 * // Call when visibility changes (e.g., from IntersectionObserver or scroll handler)
 * trackVisibility(0.6); // 60% visible
 * 
 * // Cleanup on unmount
 * useEffect(() => cleanup, []);
 * ```
 */
export function useSingleItemViewTracking(tokenId: TokenId | undefined, isSignedIn: boolean) {
  const trackerRef = useRef<ReturnType<typeof createPostViewTracker> | null>(null);
  
  useEffect(() => {
    if (tokenId) {
      trackerRef.current = createPostViewTracker(tokenId, isSignedIn);
    }
    
    return () => {
      trackerRef.current?.cleanup();
      trackerRef.current = null;
    };
  }, [tokenId, isSignedIn]);
  
  const trackVisibility = useCallback((visiblePercent: number) => {
    trackerRef.current?.onVisibilityChange(visiblePercent);
  }, []);
  
  const cleanup = useCallback(() => {
    trackerRef.current?.cleanup();
  }, []);
  
  return {
    trackVisibility,
    cleanup,
    hasRecorded: () => trackerRef.current?.hasRecorded() ?? false,
  };
}

export default usePostViewTracking;
