import React, { memo, useCallback, useState, useRef, useMemo, useEffect, startTransition } from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import Icon, { type IconName } from "../ui/Icon";
import GlassIndicator, { GLASS_SHADOW } from "../ui/GlassIndicator";
import type { PostTypeOption } from "./FeedFilterPanel";

interface NavItem {
  icon: IconName;
  postType: PostTypeOption;
  tooltip: string;
}

const NAV_ITEMS: NavItem[] = [
  { icon: "House", postType: "all", tooltip: "Home" },
  { icon: "Video", postType: "video", tooltip: "Videos" },
  { icon: "Image", postType: "feed-images", tooltip: "Images" },
  { icon: "Film", postType: "short", tooltip: "Shorts" },
  { icon: "Mic", postType: "feed-audio", tooltip: "Music" },
  { icon: "Radio", postType: "live", tooltip: "Live" },
];

interface FeedNavBarProps {
  activePostType: PostTypeOption;
  isFilterOpen: boolean;
  hasActiveFilters: boolean;
  onPostTypeChange: (postType: PostTypeOption) => void;
  onFilterPress: () => void;
}

// Web-parity slide: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)
const SLIDE_DURATION = 400;
const SLIDE_EASING = Easing.bezier(0.16, 1, 0.3, 1);

const NavButton = memo<{
  icon: IconName;
  active: boolean;
  onPress: () => void;
}>(({ icon, active, onPress }) => (
  <Pressable onPress={onPress} style={styles.navButton}>
    {({ pressed }) => (
      <View style={{ opacity: pressed ? 0.6 : 1 }}>
        <Icon
          name={icon}
          size={16}
          color={active ? "#FFFFFF" : "#71717A"}
          strokeWidth={active ? 2 : 1.8}
        />
      </View>
    )}
  </Pressable>
));

const FeedNavBar: React.FC<FeedNavBarProps> = ({
  activePostType,
  isFilterOpen,
  hasActiveFilters,
  onPostTypeChange,
  onFilterPress,
}) => {
  // Optimistic highlight: the active indicator is driven by local state so a
  // tap moves it in the very next (cheap) frame, instead of waiting for the
  // parent to mount/unmount its heavy feed list. The parent switch is deferred
  // as a low-priority transition so it never blocks that highlight paint.
  const [localActive, setLocalActive] = useState<PostTypeOption>(activePostType);
  useEffect(() => {
    // Keep in sync when the tab changes from outside (swipe gesture, filters).
    setLocalActive(activePostType);
  }, [activePostType]);

  const commitPostType = useCallback(
    (postType: PostTypeOption) => {
      setLocalActive(postType); // urgent → highlight moves instantly
      startTransition(() => onPostTypeChange(postType)); // deferred heavy swap
    },
    [onPostTypeChange],
  );

  const handleNavPress = useCallback(
    (postType: PostTypeOption) => {
      if (postType === activePostTypeRef.current) return;
      commitPostType(postType);
    },
    [commitPostType],
  );

  const [containerWidth, setContainerWidth] = useState(0);
  const buttonCount = NAV_ITEMS.length + 1; // +1 for filter button
  const buttonWidth = containerWidth > 0 ? containerWidth / buttonCount : 60;

  // Refs that stay current without triggering re-renders
  const activePostTypeRef = useRef(activePostType);
  activePostTypeRef.current = activePostType;

  // Single glass indicator that slides between tabs (web parity: the web nav
  // has ONE data-glass-indicator div that translates with a 0.4s bezier).
  // Taps animate it via withTiming; drags write to it directly on the UI thread.
  const indicatorX = useSharedValue(0);
  const hasPositionedRef = useRef(false);

  const activeIndex = Math.max(
    0,
    NAV_ITEMS.findIndex((i) => i.postType === localActive),
  );

  useEffect(() => {
    if (containerWidth <= 0) return;
    const x = activeIndex * buttonWidth;
    if (!hasPositionedRef.current) {
      // First layout: render in place with no animation (matches web's
      // "renders instantly at correct position on page load").
      hasPositionedRef.current = true;
      indicatorX.value = x;
    } else {
      indicatorX.value = withTiming(x, {
        duration: SLIDE_DURATION,
        easing: SLIDE_EASING,
      });
    }
  }, [activeIndex, buttonWidth, containerWidth, indicatorX]);

  // Snapshot at gesture start
  const startIndexRef = useRef(0);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        // No activateAfterLongPress: it activates on a stationary finger once
        // the delay elapses, which swallowed any tap held longer than it — the
        // pan stole the touch, cancelled the child Pressable, then ended with
        // translationX ~0 and resolved back to the current tab, so the tap did
        // nothing. Distance alone gates the drag, leaving taps to Pressable.
        .minDistance(5)
        .activeOffsetX([-5, 5])
        .failOffsetY([-10, 10])
        .onStart(() => {
          const idx = NAV_ITEMS.findIndex(
            (item) => item.postType === activePostTypeRef.current,
          );
          startIndexRef.current = Math.max(0, idx);
        })
        .onChange((e) => {
          if (buttonWidth <= 0) return;
          const rawIdx = startIndexRef.current + e.translationX / buttonWidth;
          const clampedIdx = Math.max(0, Math.min(NAV_ITEMS.length - 1, rawIdx));
          // Direct write follows the finger and cancels any running slide.
          indicatorX.value = clampedIdx * buttonWidth;
        })
        .onEnd((e) => {
          if (buttonWidth <= 0) return;
          const rawIdx = startIndexRef.current + e.translationX / buttonWidth;
          const clampedIdx = Math.round(
            Math.max(0, Math.min(NAV_ITEMS.length - 1, rawIdx)),
          );
          indicatorX.value = withTiming(clampedIdx * buttonWidth, {
            duration: SLIDE_DURATION,
            easing: SLIDE_EASING,
          });
          const newPostType = NAV_ITEMS[clampedIdx]?.postType;
          if (newPostType && newPostType !== activePostTypeRef.current) {
            runOnJS(commitPostType)(newPostType);
          }
        }),
    [buttonWidth, commitPostType, indicatorX],
  );

  // Sliding glass indicator — always visible, UI-thread driven
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: buttonWidth,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.outerWrap}>
        <View
          style={styles.container}
          onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
          {/* Android's experimental blur (dimezisBlurView) crashes with
              IndexOutOfBoundsException when list views mutate during its
              pre-draw snapshot — real blur is iOS-only, Android gets a
              translucent glass-tinted fallback. */}
          {Platform.OS === "ios" ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={styles.androidBlurFallback} />
          )}
          <View style={styles.glassOverlay} pointerEvents="none" />

          {/* Sliding glass indicator — one indicator that translates between
              tabs (web parity), driven on the UI thread for taps and drags */}
          <Reanimated.View style={[styles.glassIndicator, indicatorStyle]}>
            <View style={[StyleSheet.absoluteFill, { borderRadius: 12 }, GLASS_SHADOW]}>
              <GlassIndicator borderRadius={12} blurIntensity={30} />
            </View>
          </Reanimated.View>

          <View style={styles.navRow}>
            {NAV_ITEMS.map((item) => (
              <NavButton
                key={item.postType}
                icon={item.icon}
                active={localActive === item.postType}
                onPress={() => handleNavPress(item.postType)}
              />
            ))}

            <Pressable onPress={onFilterPress} style={styles.navButton}>
              {({ pressed }) => {
                const filterActive = isFilterOpen || hasActiveFilters;
                return (
                  <>
                    {filterActive && (
                      <View
                        style={[StyleSheet.absoluteFill, { borderRadius: 12 }, GLASS_SHADOW]}
                      >
                        <GlassIndicator borderRadius={12} blurIntensity={30} />
                      </View>
                    )}
                    <View style={{ opacity: pressed ? 0.6 : 1 }}>
                      <Icon
                        name={isFilterOpen ? "X" : "Settings2"}
                        size={16}
                        color={filterActive ? "#FFFFFF" : "#71717A"}
                        strokeWidth={filterActive ? 2 : 1.8}
                      />
                    </View>
                  </>
                );
              }}
            </Pressable>
          </View>
        </View>
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  outerWrap: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
  },
  container: {
    borderRadius: 12,
    overflow: "hidden",
  },
  androidBlurFallback: {
    ...StyleSheet.absoluteFillObject,
    // Translucent enough that content scrolling underneath faintly shows
    // through, reading as glass even without a real blur.
    backgroundColor: "rgba(16, 16, 20, 0.65)",
    borderRadius: 12,
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 10, 12, 0.30)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  glassIndicator: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    borderRadius: 12,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  navButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    position: "relative",
    overflow: "visible",
  },
});

export default memo(FeedNavBar);
