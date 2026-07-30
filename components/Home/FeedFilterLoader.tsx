/**
 * Feed Filter Loader
 * ==================
 * The loader that covers the Home pager while a filter toggle's request is in
 * flight. Paired with `useFeedFilterTransition` — see that hook for why a
 * list's own `isLoading` can't drive this.
 *
 * It is deliberately OPAQUE and covers the whole pager viewport rather than
 * dimming it. A filter change re-keys every mounted page at once; showing the
 * stale results underneath a translucent veil is what made the old behaviour
 * read as a frozen screen instead of a loading one.
 *
 * Mounted only while the transition is active, so the rotation costs nothing
 * the rest of the time.
 */

import React, { memo, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const SPIN_MS = 900;
const RING_SIZE = 32;

interface FeedFilterLoaderProps {
  /** Distance from the top of the viewport to clear the collapsible header. */
  topInset?: number;
}

const FeedFilterLoaderComponent: React.FC<FeedFilterLoaderProps> = ({ topInset = 0 }) => {
  const { t } = useTranslation();
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: SPIN_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(rotation);
  }, [rotation]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View
      style={[styles.overlay, { paddingTop: topInset }]}
      accessibilityRole="progressbar"
      accessibilityLabel={t("filters.updatingFeed", "Updating feed")}
      // Swallows taps on purpose: the results underneath are the OLD filter's,
      // so opening one of them mid-switch would be acting on stale content.
      pointerEvents="auto"
    >
      <View style={styles.centre}>
        {/* One bright arc on a faint ring — the same mark as the web loader. */}
        <Animated.View style={[styles.ring, ringStyle]} />
        <Text style={styles.label}>
          {t("filters.updatingFeed", "Updating feed").toUpperCase()}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    // Opaque, matching bg-theme-neutrals-900 on the screen root.
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
    // The pager row it covers is absolutely positioned; tree order alone is not
    // enough to keep this on top on Android.
    zIndex: 5,
    elevation: 5,
  },
  centre: {
    alignItems: "center",
    gap: 14,
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.12)",
    borderTopColor: "rgba(255,255,255,0.7)",
  },
  label: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "600",
    color: "#a1a1aa", // zinc-400
  },
});

export const FeedFilterLoader = memo(FeedFilterLoaderComponent);
export default FeedFilterLoader;
