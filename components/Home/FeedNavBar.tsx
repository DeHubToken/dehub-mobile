import React, { memo, useCallback, useState, useRef, useMemo } from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue,
} from "react-native-reanimated";
import Icon, { type IconName } from "../ui/Icon";
import GlassIndicator, { GLASS_SHADOW } from "../ui/GlassIndicator";
import type { PostTypeOption } from "./FeedFilterPanel";

interface NavItem {
  icon: IconName;
  postType: PostTypeOption;
  tooltip: string;
}

// Order matters twice over: it is the pager's page order (HomeScreen's
// TAB_ORDER must stay identical — the two are indexed against each other) and
// it matches web's FEED_TABS, so the same tab sits in the same place on both.
const NAV_ITEMS: NavItem[] = [
  { icon: "House", postType: "all", tooltip: "Home" },
  { icon: "Film", postType: "short", tooltip: "Shorts" },
  { icon: "Image", postType: "feed-images", tooltip: "Images" },
  { icon: "Video", postType: "video", tooltip: "Videos" },
  { icon: "Mic", postType: "feed-audio", tooltip: "Music" },
  { icon: "Radio", postType: "live", tooltip: "Live" },
];

interface FeedNavBarProps {
  /** Settled tab index — drives the icon highlight. */
  activeIndex: number;
  /**
   * Live pager position in page units, shared with HomeScreen. The glass
   * indicator reads it directly on the UI thread, so it tracks a swipe frame
   * for frame with the feed underneath instead of animating on its own clock.
   */
  progress: SharedValue<number>;
  isFilterOpen: boolean;
  hasActiveFilters: boolean;
  onPostTypeChange: (postType: PostTypeOption) => void;
  onFilterPress: () => void;
  /**
   * While a sub-view is up over the feed (the image drawer), the leading slot
   * stops being the filter toggle and becomes that sub-view's way out — the
   * same slot doing the same job as web's nav pill, so leaving a feed is always
   * the same control in the same place.
   */
  backMode?: boolean;
  onBackPress?: () => void;
}

// Web-parity slide: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1). Only used for
// a drag that lands back where it started; taps and swipes are animated by
// HomeScreen so the pill and the page move as one.
const SNAP_BACK = { duration: 260, easing: Easing.bezier(0.22, 1, 0.36, 1) } as const;
const EDGE_RESISTANCE = 0.28;
const VELOCITY_PROJECTION = 0.12;
const LAST_INDEX = NAV_ITEMS.length - 1;

const NavButton = memo<{
  icon: IconName;
  label: string;
  active: boolean;
  onPress: () => void;
}>(({ icon, label, active, onPress }) => (
  // These six are the most-used control in the app and were icon-only with no
  // label, so a screen reader announced all of them identically as "button".
  // NAV_ITEMS already carries the right words in `tooltip`; `selected` is what
  // conveys which tab you are on, since the icon does it visually via colour.
  <Pressable
    onPress={onPress}
    style={styles.navButton}
    accessibilityRole="tab"
    accessibilityLabel={label}
    accessibilityState={{ selected: active }}
  >
    {({ pressed }) => (
      <View style={{ opacity: pressed ? 0.6 : 1 }}>
        <Icon
          name={icon}
          size={16}
          color={active ? "#FFFFFF" : "#808089"}
          strokeWidth={active ? 2 : 1.8}
        />
      </View>
    )}
  </Pressable>
));

const FeedNavBar: React.FC<FeedNavBarProps> = ({
  activeIndex,
  progress,
  isFilterOpen,
  hasActiveFilters,
  onPostTypeChange,
  onFilterPress,
  backMode = false,
  onBackPress,
}) => {
  const [containerWidth, setContainerWidth] = useState(0);
  const buttonCount = NAV_ITEMS.length + 1; // +1 for the leading filter/back slot
  const buttonWidth = containerWidth > 0 ? containerWidth / buttonCount : 60;

  // Read on the UI thread by the drag worklet, which cannot see React refs.
  const dragStart = useSharedValue(0);

  const handleNavPress = useCallback(
    (postType: PostTypeOption) => {
      onPostTypeChange(postType);
    },
    [onPostTypeChange],
  );

  const commitIndex = useCallback(
    (idx: number) => {
      const postType = NAV_ITEMS[idx]?.postType;
      if (postType) onPostTypeChange(postType);
    },
    [onPostTypeChange],
  );

  // Dragging across the nav bar scrubs the pager itself, same maths as the
  // pager's own pan — the indicator is just a view of `progress`.
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
          cancelAnimation(progress);
          dragStart.value = progress.value;
        })
        .onUpdate((e) => {
          if (buttonWidth <= 0) return;
          // A nav-bar drag is scaled by button width, not page width: the
          // finger stays on the pill it is dragging.
          const raw = dragStart.value + e.translationX / buttonWidth;
          if (raw < 0) progress.value = raw * EDGE_RESISTANCE;
          else if (raw > LAST_INDEX)
            progress.value = LAST_INDEX + (raw - LAST_INDEX) * EDGE_RESISTANCE;
          else progress.value = raw;
        })
        .onEnd((e) => {
          if (buttonWidth <= 0) return;
          const from = Math.round(dragStart.value);
          const projected =
            progress.value + (e.velocityX / buttonWidth) * VELOCITY_PROJECTION;
          let target = Math.round(projected);
          if (target < 0) target = 0;
          if (target > LAST_INDEX) target = LAST_INDEX;
          if (target === from) {
            progress.value = withTiming(target, SNAP_BACK);
          } else {
            // HomeScreen animates from here — it owns the page translate.
            runOnJS(commitIndex)(target);
          }
        }),
    [buttonWidth, commitIndex, progress, dragStart],
  );

  // Sliding glass indicator — always visible, UI-thread driven. The +1 is the
  // filter/back slot the row now leads with: tab 0 starts one slot in, so
  // without it the indicator sits under the filter button on the Home tab.
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value + 1) * buttonWidth }],
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
            {/* Leading slot, web parity: filter toggle normally, the image
                drawer's back arrow while that drawer is up. */}
            <Pressable
              onPress={backMode ? onBackPress : onFilterPress}
              style={styles.navButton}
              accessibilityRole="button"
              accessibilityLabel={backMode ? "Back to grid" : "Feed filters"}
            >
              {({ pressed }) => {
                // In back mode the glass pill is suppressed even with filters
                // active — the slot is not reporting filter state any more.
                const filterActive = !backMode && (isFilterOpen || hasActiveFilters);
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
                        name={backMode ? "ArrowLeft" : isFilterOpen ? "X" : "Settings2"}
                        size={16}
                        color={filterActive || backMode ? "#FFFFFF" : "#808089"}
                        strokeWidth={filterActive || backMode ? 2 : 1.8}
                      />
                    </View>
                  </>
                );
              }}
            </Pressable>

            {NAV_ITEMS.map((item, index) => (
              <NavButton
                key={item.postType}
                icon={item.icon}
                label={item.tooltip}
                active={index === activeIndex}
                onPress={() => handleNavPress(item.postType)}
              />
            ))}
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
