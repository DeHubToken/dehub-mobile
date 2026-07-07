import React, { memo, useCallback, useState, useRef, useMemo } from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
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

const NavButton = memo<{
  icon: IconName;
  active: boolean;
  onPress: () => void;
}>(({ icon, active, onPress }) => (
  <Pressable onPress={onPress} style={styles.navButton}>
    {({ pressed }) => (
      <>
        {active && (
          <View style={[StyleSheet.absoluteFill, { borderRadius: 12 }, GLASS_SHADOW]}>
            <GlassIndicator borderRadius={12} />
          </View>
        )}
        <View style={{ opacity: pressed ? 0.6 : 1 }}>
          <Icon
            name={icon}
            size={16}
            color={active ? "#FFFFFF" : "#71717A"}
            strokeWidth={active ? 2 : 1.8}
          />
        </View>
      </>
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
  const handleNavPress = useCallback(
    (postType: PostTypeOption) => onPostTypeChange(postType),
    [onPostTypeChange],
  );

  const [containerWidth, setContainerWidth] = useState(0);
  const buttonCount = NAV_ITEMS.length + 1; // +1 for filter button
  const buttonWidth = containerWidth > 0 ? containerWidth / buttonCount : 60;

  // Refs that stay current without triggering re-renders
  const activePostTypeRef = useRef(activePostType);
  activePostTypeRef.current = activePostType;

  // UI-thread values for the drag indicator
  const isDragging = useSharedValue(false);
  const dragTranslateX = useSharedValue(0);

  // Snapshot at gesture start
  const startIndexRef = useRef(0);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(80)
        .minDistance(5)
        .onStart(() => {
          const idx = NAV_ITEMS.findIndex(
            (item) => item.postType === activePostTypeRef.current,
          );
          startIndexRef.current = Math.max(0, idx);
          isDragging.value = true;
        })
        .onChange((e) => {
          if (buttonWidth <= 0) return;
          const rawIdx = startIndexRef.current + e.translationX / buttonWidth;
          const clampedIdx = Math.max(0, Math.min(NAV_ITEMS.length - 1, rawIdx));
          dragTranslateX.value = clampedIdx * buttonWidth;
        })
        .onEnd((e) => {
          isDragging.value = false;
          if (buttonWidth <= 0) return;
          const rawIdx = startIndexRef.current + e.translationX / buttonWidth;
          const clampedIdx = Math.round(
            Math.max(0, Math.min(NAV_ITEMS.length - 1, rawIdx)),
          );
          const newPostType = NAV_ITEMS[clampedIdx]?.postType;
          if (newPostType && newPostType !== activePostTypeRef.current) {
            runOnJS(onPostTypeChange)(newPostType);
          }
        }),
    [buttonWidth, onPostTypeChange, isDragging, dragTranslateX],
  );

  // Animated glass indicator that slides on the UI thread during drag
  const dragIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragTranslateX.value }],
    width: buttonWidth,
    opacity: isDragging.value ? 1 : 0,
    position: "absolute" as const,
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

          {/* Floating drag indicator — UI-thread only, zero JS lag */}
          <Reanimated.View style={[styles.dragIndicator, dragIndicatorStyle]}>
            <View style={StyleSheet.absoluteFill}>
              <View style={[StyleSheet.absoluteFill, { borderRadius: 12 }, GLASS_SHADOW]}>
                <GlassIndicator borderRadius={12} />
              </View>
            </View>
          </Reanimated.View>

          <View style={styles.navRow}>
            {NAV_ITEMS.map((item) => (
              <NavButton
                key={item.postType}
                icon={item.icon}
                active={!isDragging.value && activePostType === item.postType}
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
                        <GlassIndicator borderRadius={12} />
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
  dragIndicator: {
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
