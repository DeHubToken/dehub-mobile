/**
 * A block of a feed card that is expensive to mount and carries no layout
 * information of its own: while the feed is being flung it renders as an
 * empty box of the size the same block last measured at, and mounts its
 * children once the list settles.
 *
 * The deferred icons (libs/scrollActivity) cut the mid-fling cost of a card
 * by roughly the icon half; this takes the action row and the header's
 * buttons — seven pressables with their bounce wrappers and counts — out of
 * the fling too. The box is sized from the last real measurement under the
 * same key, so the first card of a kind (measured at rest, at launch) sets
 * the size for every later one; a block with no measurement yet renders for
 * real, which only ever happens at rest.
 */
import React, { useCallback } from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { useReadyAfterScroll } from "../../libs/scrollActivity";

const measured = new Map<string, { width: number; height: number }>();

interface Props {
  /** Blocks that share a key share a measured size — one key per layout. */
  cacheKey: string;
  /** Reserve width as well as height (a row item), not just height (a full-width row). */
  reserveWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export default function DeferredBlock({ cacheKey, reserveWidth = false, style, children }: Props) {
  const ready = useReadyAfterScroll();
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      if (width > 0 && height > 0) measured.set(cacheKey, { width, height });
    },
    [cacheKey],
  );
  const size = measured.get(cacheKey);
  if (!ready && size) {
    return (
      <View
        style={[style, reserveWidth ? { width: size.width, height: size.height } : { height: size.height }]}
      />
    );
  }
  return (
    <View style={style} onLayout={onLayout}>
      {children}
    </View>
  );
}

export function __resetDeferredBlockCacheForTests(): void {
  measured.clear();
}
