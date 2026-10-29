import { useTranslation as _useCopy } from 'react-i18next';
import React, { memo, useCallback, useState, useRef, useMemo, useEffect } from "react";
import { View, Pressable, StyleSheet, Platform, Image, type LayoutChangeEvent } from "react-native";
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
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_TAB_LINE } from "../../theme/colors";
import { GRAIN, glassTint } from "../../theme/skins";
import FrostedPill, { LIGHT_PILL_SHADOW } from "../ui/FrostedPill";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import NavPillSurface from "../ui/NavPillSurface";
import HudBrackets from "../theme/HudBrackets";
import { useSwipeBackAction } from '../../hooks/useSwipeBack';
import { useAppPrefs } from '../../hooks/useAppPrefs';
import { translateCopy as _translateCopy } from "../../i18n/copy";
import FeedSearchBar from "./FeedSearchBar";
import type { FeedSearchTab } from "../../libs/feed-search";

interface NavItem {
  icon: IconName;
  postType: PostTypeOption;
  tooltip: string;
}

// Order matters twice over: it is the pager's page order (HomeScreen's
// TAB_ORDER must stay identical — the two are indexed against each other) and
// it matches web's FEED_TABS, so the same tab sits in the same place on both.
const NAV_ITEMS: NavItem[] = [
  { icon: "House", postType: "all", get tooltip() { return _translateCopy("copy.3a78695388b3", { defaultValue: "Home" }); } },
  { icon: "Shorts", postType: "short", get tooltip() { return _translateCopy("copy.3c784a16cf27", { defaultValue: "Shorts" }); } },
  { icon: "Image", postType: "feed-images", get tooltip() { return _translateCopy("copy.be7e2f201293", { defaultValue: "Images" }); } },
  { icon: "Video", postType: "video", get tooltip() { return _translateCopy("copy.c9a9639463c2", { defaultValue: "Videos" }); } },
  { icon: "Mic", postType: "feed-audio", get tooltip() { return _translateCopy("copy.6eb00b4b2614", { defaultValue: "Music" }); } },
  { icon: "Radio", postType: "live", get tooltip() { return _translateCopy("copy.b64ac05f17e6", { defaultValue: "Live" }); } },
];

/** The tabs in pager order, for chrome that names the current one (the
 *  system theme's collapsed island). */
export const FEED_NAV_ITEMS: readonly NavItem[] = NAV_ITEMS;
const NAV_ITEMS_NO_SHORTS: readonly NavItem[] = NAV_ITEMS.filter((item) => item.postType !== "short");

/**
 * The tabs actually shown, in pager order. Turning Shorts off in Settings
 * drops the Shorts tab, as web's GlobalFeedNav does. HomeScreen's pager,
 * this bar and the island menu all index against this same list.
 */
export function useFeedNavItems(): readonly NavItem[] {
  const { shorts } = useAppPrefs();
  return shorts ? NAV_ITEMS : NAV_ITEMS_NO_SHORTS;
}

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
  onActiveTabLongPress: () => void;
  /**
   * While a sub-view is up over the feed (the image drawer), the leading slot
   * stops being the filter toggle and becomes that sub-view's way out — the
   * same slot doing the same job as web's nav pill, so leaving a feed is always
   * the same control in the same place.
   */
  backMode?: boolean;
  /**
   * Set while the pill is a search box (the lit tab was tapped again). The tab
   * row hides under FeedSearchBar until it closes.
   */
  search?: {
    tab: FeedSearchTab;
    query: string;
    onChangeQuery: (q: string) => void;
    onClose: () => void;
    onPickFeed: (tab: FeedSearchTab) => void;
  } | null;
  /** Back names the surface being closed; image drawers keep the grid label. */
  backLabel?: string;
  onBackPress?: () => void;
}

// Web-parity slide: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1). Only used for
// a drag that lands back where it started; taps and swipes are animated by
// HomeScreen so the pill and the page move as one.
const SNAP_BACK = { duration: 260, easing: Easing.bezier(0.22, 1, 0.36, 1) } as const;
const EDGE_RESISTANCE = 0.28;
const VELOCITY_PROJECTION = 0.12;
// Match the visible Cut artwork to Shorts; keep in sync with web's FEED_TAB_ICON_SCALE.
const FEED_NAV_ICON_SCALE: Partial<Record<IconName, number>> = {
  House: 1.15,
  Shorts: 1,
  Image: 1.16,
  Video: 1.08,
  Mic: 1.09,
  Radio: 1,
  Settings2: 1.18,
};

const NavButton = memo<{
  icon: IconName;
  label: string;
  active: boolean;
  onPress: () => void;
  onLongPress: () => void;
  minimal?: boolean;
  /** A canvas theme's icon colours (theme/skins.ts). */
  tint?: { on: string; off: string };
}>(({ icon, label, active, onPress, onLongPress, minimal = false, tint }) => {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const cancelled = useRef(false);
  useEffect(() => { cancelled.current = true; }, [active]);
  return (
  // These six are the most-used control in the app and were icon-only with no
  // label, so a screen reader announced all of them identically as "button".
  // NAV_ITEMS already carries the right words in `tooltip`; `selected` is what
  // conveys which tab you are on, since the icon does it visually via colour.
  <Pressable
    onPress={onPress}
    delayLongPress={500}
    onPressIn={(event) => {
      touchStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
      cancelled.current = !active;
    }}
    onTouchMove={(event) => {
      const start = touchStart.current;
      if (!start || event.nativeEvent.touches.length > 1 || Math.hypot(event.nativeEvent.pageX - start.x, event.nativeEvent.pageY - start.y) > 5) {
        cancelled.current = true;
      }
    }}
    onTouchStart={(event) => { if (event.nativeEvent.touches.length > 1) cancelled.current = true; }}
    onTouchCancel={() => { cancelled.current = true; }}
    onPressOut={() => { cancelled.current = true; }}
    onLongPress={active ? () => { if (!cancelled.current) onLongPress(); } : undefined}
    style={styles.navButton}
    accessibilityRole="tab"
    accessibilityLabel={label}
    accessibilityState={{ selected: active }}
  >
    {({ pressed }) => (
      <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 }}>
        <Icon
          name={icon}
          size={16 * (FEED_NAV_ICON_SCALE[icon] ?? 1)}
          color={tint ? (active ? tint.on : tint.off) : active ? "#FFFFFF" : minimal ? "#A1A1AA" : "#808089"}
          strokeWidth={active ? 2 : 1.8}
        />
      </View>
    )}
  </Pressable>
  );
});

const FeedNavBar: React.FC<FeedNavBarProps> = ({
  activeIndex,
  progress,
  isFilterOpen,
  hasActiveFilters,
  onPostTypeChange,
  onFilterPress,
  onActiveTabLongPress,
  backMode = false,
  backLabel,
  onBackPress,
  search = null,
}) => {
  useSwipeBackAction(onBackPress, backMode);
  const { t: _copy } = _useCopy();
  const NAV_ITEMS = useFeedNavItems();
  const LAST_INDEX = NAV_ITEMS.length - 1;
  const { isMinimal, skin, isLight } = useAppTheme();
  const tint = useMemo(
    () => (skin ? { on: skin.tabIconActive, off: skin.tabIcon } : undefined),
    [skin],
  );
  const [containerWidth, setContainerWidth] = useState(0);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    // A detached/collapsed screen can report an empty row. Retain the last
    // visible geometry instead of flashing the fallback selection on return.
    if (height > 0 && Number.isFinite(width) && width > (isMinimal ? 0 : LEAD_SLOT_WIDTH)) {
      setContainerWidth(width);
    }
  }, [isMinimal]);
  const buttonCount = NAV_ITEMS.length + 1; // +1 for the leading filter/back slot
  // Glass pill, as on web: a 40pt leading slot and the tabs sharing the rest.
  // Minimal's file-tab strip keeps equal cells.
  const buttonWidth = containerWidth > 0
    ? isMinimal ? containerWidth / buttonCount : (containerWidth - LEAD_SLOT_WIDTH) / NAV_ITEMS.length
    : 60;

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
    [onPostTypeChange, NAV_ITEMS],
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
        .enabled(!search)
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
    [buttonWidth, commitIndex, progress, dragStart, LAST_INDEX, search],
  );

  const searchBar = (fromX: number) => search && containerWidth > 0 ? (
    <FeedSearchBar
      tab={search.tab}
      query={search.query}
      onChangeQuery={search.onChangeQuery}
      onClose={search.onClose}
      onPickFeed={search.onPickFeed}
      onFilterPress={onFilterPress}
      filterActive={isFilterOpen || hasActiveFilters}
      width={containerWidth}
      fromX={fromX}
      fromWidth={buttonWidth}
      tint={tint}
      activeStyle={skin ? skin.stripActive : undefined}
    />
  ) : null;
  // The tab row fades out under the search box rather than unmounting, so the
  // indicator keeps its place for when the box melts back into it.
  const hiddenUnderSearch = search ? styles.hiddenUnderSearch : null;

  // Sliding glass indicator — always visible, UI-thread driven. The +1 is the
  // filter/back slot the row now leads with: tab 0 starts one slot in, so
  // without it the indicator sits under the filter button on the Home tab.
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value + 1) * buttonWidth }],
    width: buttonWidth,
  }));
  // Web's glass indicator: 95% of the tab, 35pt tall, centred in the row so its
  // rims sit an equal step inside the pill's top and bottom edges.
  const glassIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: LEAD_SLOT_WIDTH + (progress.value + INDICATOR_SIDE_GAP) * buttonWidth }],
    width: buttonWidth * (1 - INDICATOR_SIDE_GAP * 2),
  }));

  return (
    <GestureDetector gesture={panGesture}>
      {isMinimal ? (
        // Web's minimal feed nav is an OS file-tab strip: one baseline runs
        // the full width, and the active tab lifts off it with a top and side
        // outline, its black fill breaking the line underneath. Edge to edge,
        // no glass, no pill. Same slide as the glass indicator.
        <View
          style={styles.minimalBar}
          onLayout={handleLayout}
        >
          <View style={styles.minimalBaseline} pointerEvents="none" />
          {containerWidth > 0 && <Reanimated.View
            style={[styles.minimalTab, indicatorStyle, hiddenUnderSearch]}
            pointerEvents="none"
          />}
          <View style={[styles.navRow, hiddenUnderSearch]} pointerEvents={search ? "none" : "auto"}>
            <Pressable
              onPress={backMode ? onBackPress : onFilterPress}
              style={styles.minimalButton}
              accessibilityRole="button"
              accessibilityLabel={backMode ? backLabel ?? _copy("copy.68f5b97c66d9", { defaultValue: "Back to grid" }) : _copy("copy.57702fa51a5e", { defaultValue: "Feed filters" })}
              accessibilityState={backMode ? undefined : { expanded: isFilterOpen }}
            >
              {({ pressed }) => {
                const filterActive = !backMode && (isFilterOpen || hasActiveFilters);
                return (
                  <View style={{ opacity: pressed ? 0.6 : 1, transform: [{ scale: !backMode && !isFilterOpen ? FEED_NAV_ICON_SCALE.Settings2 ?? 1 : 1 }] }}>
                    <Icon
                      name={backMode ? "ArrowLeft" : isFilterOpen ? "X" : "Settings2"}
                      size={16}
                      color={filterActive || backMode ? "#FFFFFF" : "#A1A1AA"}
                      strokeWidth={filterActive || backMode ? 2 : 1.8}
                    />
                  </View>
                );
              }}
            </Pressable>
            {NAV_ITEMS.map((item, index) => (
              <View key={item.postType} style={styles.minimalCell}>
                <NavButton
                  icon={item.icon}
                  label={item.tooltip}
                  active={index === activeIndex}
                  onPress={() => handleNavPress(item.postType)}
                  onLongPress={onActiveTabLongPress}
                  minimal
                />
              </View>
            ))}
          </View>
          {searchBar((activeIndex + 1) * buttonWidth)}
        </View>
      ) : (
      <View style={styles.outerWrap}>
        <View
          style={[styles.container, skin ? { borderRadius: skin.strip.borderRadius } : isLight ? LIGHT_PILL_SHADOW : null]}
          onLayout={handleLayout}
        >
          {skin ? (
            // Keep the theme's existing outline and texture over shared frost.
            <>
                <FrostedPill
                  tint={glassTint(String(skin.strip.backgroundColor), 0.22)}
                  borderRadius={Number(skin.strip.borderRadius ?? 0)}
                  bordered={false}
                />
              <View
                style={[
                  StyleSheet.absoluteFill,
                  skin.strip,
                  { backgroundColor: "transparent" },
                ]}
                pointerEvents="none"
              />
              {skin.grain ? (
                <Image source={GRAIN} resizeMode="repeat" style={StyleSheet.absoluteFill} />
              ) : null}
            </>
          ) : (
            // The bottom bar's material, so the two bars read as one glass.
            <NavPillSurface borderRadius={NAV_PILL_RADIUS} />
          )}

          {/* FrostedPill owns the backdrop blur. The moving selection only
              adds its tint and rim, matching the web nav without a second
              blur sample that can leave a seam during tab transitions. */}
          {containerWidth > 0 && <Reanimated.View style={[styles.glassIndicator, skin ? { borderRadius: skin.stripActive.borderRadius } : null, glassIndicatorStyle, hiddenUnderSearch]}>
            {skin ? (
              <View style={[StyleSheet.absoluteFill, skin.stripActive]} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { borderRadius: 12 }, GLASS_SHADOW]}>
                <GlassIndicator borderRadius={12} />
              </View>
            )}
          </Reanimated.View>}
          {skin?.brackets ? <HudBrackets color={skin.brackets} /> : null}

          <View style={[styles.navRow, hiddenUnderSearch]} pointerEvents={search ? "none" : "auto"}>
            {/* Leading slot, web parity: filter toggle normally, the image
                drawer's back arrow while that drawer is up. */}
            <Pressable
              onPress={backMode ? onBackPress : onFilterPress}
              style={[styles.navButton, styles.leadSlot]}
              accessibilityRole="button"
              accessibilityLabel={backMode ? backLabel ?? _copy("copy.68f5b97c66d9", { defaultValue: "Back to grid" }) : _copy("copy.57702fa51a5e", { defaultValue: "Feed filters" })}
              accessibilityState={backMode ? undefined : { expanded: isFilterOpen }}
            >
              {({ pressed }) => {
                // In back mode the glass pill is suppressed even with filters
                // active — the slot is not reporting filter state any more.
                const filterActive = !backMode && (isFilterOpen || hasActiveFilters);
                return (
                  <>
                    {!backMode && hasActiveFilters && (
                      <FilterGlow color={tint ? tint.on : "#FFFFFF"} />
                    )}
                    <View style={{ opacity: pressed ? 0.6 : 1, transform: [{ scale: !backMode && !isFilterOpen ? FEED_NAV_ICON_SCALE.Settings2 ?? 1 : 1 }] }}>
                      <Icon
                        name={backMode ? "ArrowLeft" : isFilterOpen ? "X" : "Settings2"}
                        size={16}
                        color={
                          tint
                            ? filterActive || backMode ? tint.on : tint.off
                            : filterActive || backMode ? "#FFFFFF" : "#808089"
                        }
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
                  onLongPress={onActiveTabLongPress}
                tint={tint}
              />
            ))}
          </View>
          {searchBar(LEAD_SLOT_WIDTH + activeIndex * buttonWidth)}
        </View>
      </View>
      )}
    </GestureDetector>
  );
};

/** The glass pill's leading filter/back slot: web's px-3 around a 16pt icon. */
const LEAD_SLOT_WIDTH = 40;
/** Web trims the glass indicator to 95% of its tab (2.5% each side). */
const INDICATOR_SIDE_GAP = 0.025;
/** Web's indicator is 35pt tall inside the 36pt tab row. */
const INDICATOR_HEIGHT = 35;

/** Gap between the top of FeedNavBar and the top edge of its pill. */
export const NAV_PILL_TOP_INSET = 8;
/** Corner radius of the default (system) pill; canvas themes use their skin's. */
export const NAV_PILL_RADIUS = 12;
/** Gap between each screen edge and the side of the pill. */
export const NAV_PILL_SIDE_INSET = 8;

const styles = StyleSheet.create({
  hiddenUnderSearch: { opacity: 0 },
  outerWrap: {
    paddingHorizontal: NAV_PILL_SIDE_INSET,
    paddingTop: NAV_PILL_TOP_INSET,
    // 2pt wrapper + 4pt list inset + 6pt card margin matches the 12pt gap
    // between every pair of feed bentos.
    paddingBottom: 2,
  },
  container: {
    borderRadius: NAV_PILL_RADIUS,
    overflow: "hidden",
  },
  androidBlurFallback: {
    ...StyleSheet.absoluteFillObject,
    // Android has no safe blur, so its pill is solid: a translucent wash
    // without a blur lets post text read through the tab labels.
    backgroundColor: "rgb(16, 16, 20)",
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
    // Centred on the row, not pinned under its top: the House icon makes the
    // row 38pt, so a fixed top left the box riding high in the pill.
    top: "50%",
    marginTop: -INDICATOR_HEIGHT / 2,
    left: 0,
    height: INDICATOR_HEIGHT,
    borderRadius: 12,
  },
  filterGlow: { position: "absolute", top: 4, bottom: 4, left: 6, right: 6 },
  leadSlot: { flexGrow: 0, flexShrink: 0, flexBasis: LEAD_SLOT_WIDTH, width: LEAD_SLOT_WIDTH },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  minimalBar: {
    backgroundColor: "#000",
    position: "relative",
  },
  minimalBaseline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: MINIMAL_TAB_LINE,
  },
  // Drawn under the row: black fill hides the baseline beneath the active
  // tab, and the outline is on three sides only so the tab opens into the page.
  minimalTab: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: "#000",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: MINIMAL_TAB_LINE,
  },
  minimalButton: {
    flex: 1,
    // 44pt: the smallest comfortable tap target on either platform.
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  // Holds a NavButton, which brings its own centring and fills this cell.
  minimalCell: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
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

/**
 * Filters-on mark, web parity: a soft round glow behind the filter icon
 * (web draws a blurred radial gradient). Fades to nothing at the edge so it
 * never reads as a second selected tab.
 */
const FilterGlow = memo(({ color }: { color: string }) => (
  <View pointerEvents="none" style={styles.filterGlow}>
    <Svg width="100%" height="100%">
      <Defs>
        <RadialGradient id="feedFilterGlow" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor={color} stopOpacity={0.55} />
          <Stop offset="0.6" stopColor={color} stopOpacity={0.15} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#feedFilterGlow)" />
    </Svg>
  </View>
));

export default memo(FeedNavBar);
