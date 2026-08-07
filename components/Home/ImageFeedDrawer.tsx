import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BackHandler,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Icon from "../ui/Icon";
import FeedCard from "./FeedCard";
import { colors } from "../../theme/colors";
import { getUnifiedFeed } from "../../services/feed.unified.service";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// Animated wrapper so a worklet onScroll runs on the UI thread; cast keeps FlatList generics.
const AnimatedFlatList = Animated.FlatList as unknown as typeof FlatList;

/** The grab-handle strip that caps the sheet and doubles as its drag target. */
const GRAB_ROW_HEIGHT = 30;
const SHEET_RADIUS = 22;

const OPEN_SPRING = {
  damping: 30,
  stiffness: 340,
  mass: 0.9,
  overshootClamping: true,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 2,
} as const;

const CLOSE_TIMING = { duration: 220, easing: Easing.bezier(0.4, 0, 1, 1) } as const;
// Only ever runs when the host's chrome changes size mid-session (the filter
// panel opening under the nav bar), so it just needs to not jump.
const INSET_TIMING = { duration: 200, easing: Easing.bezier(0.25, 1, 0.5, 1) } as const;

/** A drag this far down, or thrown this fast, dismisses the sheet. */
const CLOSE_DRAG_DISTANCE = 120;
const CLOSE_DRAG_VELOCITY = 900;

export interface ImageFeedDrawerProps {
  /** Posts already loaded by the surface that opened the drawer. */
  initialItems: UnifiedFeedItem[];
  /** Index into `initialItems` of the tapped post. */
  initialIndex: number;
  /** Feed query params, minus postType — the drawer always asks for images. */
  feedParams?: Record<string, any>;
  pageSize?: number;
  /**
   * Height of the host chrome the sheet rests below. The sheet is a full screen
   * tall and simply sits this far down, so the strip that hangs off the bottom
   * is exactly what it reclaims once the chrome collapses.
   */
  topInset?: number;
  /**
   * The host header's live translateY (0 when shown, -topInset when collapsed).
   * The sheet adds it to its own offset, so a collapsed header means a
   * fullscreen sheet without a single frame of disagreement between the two.
   */
  headerTranslateY?: SharedValue<number> | null;
  /** Room to leave under the last card (floating tab bar, home indicator). */
  bottomInset?: number;
  /** Worklet scroll handler driving the host's collapsible header. */
  scrollHandler?: any;
  onScrollBegin?: () => void;
  onScrollEnd?: () => void;
  /**
   * The X in the grab handle. Hosts whose own chrome offers a way out — the
   * home nav bar, whose leading slot becomes a back arrow — turn it off rather
   * than show two exits at once. The routed host has no nav bar, so it keeps it.
   */
  showCloseButton?: boolean;
  /** Called once the sheet has finished animating off-screen. */
  onClose: () => void;
}

export interface ImageFeedDrawerHandle {
  /** Slide the sheet out, then fire `onClose`. Same path as the X and back. */
  close: () => void;
}

/**
 * The image feed, as a sheet that hangs off the bottom of the host's nav chrome
 * rather than a screen that covers it.
 *
 * Tapping a tile in the collage used to push a full screen whose only way back
 * was a chevron in a black banner. Here the nav bar stays where it was and
 * stays live, and the sheet is dismissed the way a sheet is: flick it down,
 * tap the X, or press back.
 *
 * The sheet is deliberately laid out once and never re-laid-out: it is always a
 * full screen tall and only ever moves by `transform`. Animating its height (or
 * a spacer inside the list, which is how the feeds behind it handle their own
 * header) would resize the list's content box on every frame of the collapse
 * and shift every row below the fold — the same trap documented in
 * HomeImageGrid.
 */
const ImageFeedDrawer = forwardRef<ImageFeedDrawerHandle, ImageFeedDrawerProps>(({
  initialItems,
  initialIndex,
  feedParams,
  pageSize = 20,
  topInset = 0,
  headerTranslateY = null,
  bottomInset = 0,
  scrollHandler,
  onScrollBegin,
  onScrollEnd,
  showCloseButton = true,
  onClose,
}, ref) => {
  const [items, setItems] = useState<UnifiedFeedItem[]>(initialItems);
  // The tapped post is rotated to the front (see orderedItems), so the card in
  // view on open is index 0 — not initialIndex.
  const [activeIndex, setActiveIndex] = useState(0);
  const [noMore, setNoMore] = useState(false);

  // Whatever the grid had already paged in is page 1..n; carry on from there
  // rather than re-requesting pages the caller handed us.
  const pageRef = useRef(Math.max(1, Math.ceil(initialItems.length / pageSize)));
  const exhaustedRef = useRef(false);
  const inFlightRef = useRef(false);

  const listRef = useAnimatedRef<any>();
  // Read straight off the scroll view on the UI thread, so the drag-to-dismiss
  // gesture can tell "at the top" without taking over onScroll — that belongs
  // to the host's header handler.
  const scrollY = useScrollOffset(listRef);

  // ── Sheet position ────────────────────────────────────────────────────────
  // One value for the whole vertical story: SCREEN_HEIGHT while closed, 0 while
  // open and resting, and whatever the finger says mid-drag. The host chrome's
  // own offset is added on top of it, never folded into it.
  const sheetY = useSharedValue(SCREEN_HEIGHT);
  const dragStart = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const topInsetSV = useSharedValue(topInset);
  const headerSV = headerTranslateY ?? null;
  const closingRef = useRef(false);

  // The list is held back for one frame so the slide can begin in the commit
  // that mounts the sheet. FeedCard is a heavy mount — a carousel, an action
  // bar and a dozen lazy sheets each — and rendering even one of them in the
  // same commit pushed `withSpring` a frame or more past the tap, which is the
  // pause that read as "nothing happened yet". The sheet is still off the
  // bottom of the screen while it is empty, so nothing blank is ever on show.
  const [contentReady, setContentReady] = useState(false);
  useLayoutEffect(() => {
    sheetY.value = withSpring(0, OPEN_SPRING);
    const raf = requestAnimationFrame(() => setContentReady(true));
    return () => cancelAnimationFrame(raf);
  }, [sheetY]);

  useEffect(() => {
    topInsetSV.value = withTiming(topInset, INSET_TIMING);
  }, [topInset, topInsetSV]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    sheetY.value = withTiming(SCREEN_HEIGHT, CLOSE_TIMING, (finished) => {
      "worklet";
      if (finished) runOnJS(onClose)();
    });
  }, [sheetY, onClose]);

  // The host's nav bar drives the same animated dismissal the X and the flick
  // use, rather than unmounting the sheet from under itself.
  useImperativeHandle(ref, () => ({ close }), [close]);

  // Back closes the sheet instead of unwinding the whole screen behind it.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [close]);

  const sheetStyle = useAnimatedStyle(() => {
    const headerOffset = headerSV ? headerSV.value : 0;
    const resting = Math.max(0, topInsetSV.value + headerOffset);
    return { transform: [{ translateY: resting + sheetY.value }] };
  });

  // The handle belongs to the "drawer" state. Once the chrome has collapsed and
  // the sheet is fullscreen there is nothing left to sit below, so it fades out
  // — scrolling up a little brings both back together.
  const grabStyle = useAnimatedStyle(() => {
    const inset = topInsetSV.value;
    if (inset <= 0 || !headerSV) return { opacity: 1 };
    const collapsed = Math.min(1, Math.max(0, -headerSV.value / inset));
    return { opacity: 1 - collapsed };
  });

  // Mirrors grabStyle's opacity so an invisible handle can't eat the top 30px
  // of a fullscreen sheet.
  const [handleActive, setHandleActive] = useState(true);
  useAnimatedReaction(
    () => {
      const inset = topInsetSV.value;
      if (inset <= 0 || !headerSV) return true;
      return -headerSV.value / inset < 0.5;
    },
    (active, prev) => {
      if (prev !== null && active !== prev) runOnJS(setHandleActive)(active);
    },
  );

  // ── Dismiss gestures ──────────────────────────────────────────────────────
  // Both pans are built once and never rebuilt: everything they close over is
  // either a shared value or `close`, which is stable. The drag/settle bodies
  // are spelled out in each rather than shared through a helper — a helper
  // would have to be a worklet in the dependency list, and a fresh identity per
  // render would re-attach the gesture handlers on every render.
  const grabPan = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          "worklet";
          dragStart.value = sheetY.value;
        })
        .onUpdate((e) => {
          "worklet";
          sheetY.value = Math.max(0, dragStart.value + e.translationY);
        })
        .onEnd((e) => {
          "worklet";
          if (e.translationY > CLOSE_DRAG_DISTANCE || e.velocityY > CLOSE_DRAG_VELOCITY) {
            runOnJS(close)();
            return;
          }
          sheetY.value = withSpring(0, OPEN_SPRING);
        }),
    [dragStart, sheetY, close],
  );

  const contentPan = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesDown((e) => {
          "worklet";
          touchStartY.value = e.allTouches[0]?.y ?? 0;
        })
        .onTouchesMove((e, state) => {
          "worklet";
          const dy = (e.allTouches[0]?.y ?? touchStartY.value) - touchStartY.value;
          // Only claim the gesture when the list has nothing left to give and
          // the finger is heading down. Deliberately never fails otherwise:
          // failing ends tracking outright, whereas staying in BEGAN lets the
          // native scroll take it (same reasoning as useBottomSheetGestures).
          if (scrollY.value <= 1 && dy > 8) state.activate();
        })
        .onStart(() => {
          "worklet";
          dragStart.value = sheetY.value;
        })
        .onUpdate((e) => {
          "worklet";
          sheetY.value = Math.max(0, dragStart.value + e.translationY);
        })
        .onEnd((e) => {
          "worklet";
          if (e.translationY > CLOSE_DRAG_DISTANCE || e.velocityY > CLOSE_DRAG_VELOCITY) {
            runOnJS(close)();
            return;
          }
          sheetY.value = withSpring(0, OPEN_SPRING);
        }),
    [dragStart, scrollY, sheetY, touchStartY, close],
  );

  // ── Feed ──────────────────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (exhaustedRef.current || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const nextPage = pageRef.current + 1;
      const res = await getUnifiedFeed({
        ...(feedParams || {}),
        postType: "feed-images",
        page: nextPage,
        limit: pageSize,
      });
      const incoming = res.result || [];

      if (incoming.length === 0 || !res.pagination?.hasMore) {
        exhaustedRef.current = true;
        setNoMore(true);
      }
      pageRef.current = nextPage;

      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.tokenId ?? i.id));
        const unique = incoming.filter((i) => !seen.has(i.tokenId ?? i.id));
        return unique.length ? [...prev, ...unique] : prev;
      });
    } catch {
      // Silent: the footer simply stops advancing.
    } finally {
      inFlightRef.current = false;
    }
  }, [feedParams, pageSize]);

  // Opening the feed *at* the tapped post, the way web's ImagesFeed does it:
  // rather than scrolling to an index — unreliable once rows are variable
  // height, since getItemLayout can no longer be supplied — the tapped post is
  // rotated to the front and the rest follow. Anything before it is still
  // reachable by closing the drawer, same as web.
  const orderedItems = useMemo(() => {
    if (!items.length) return items;
    const start = Math.max(0, Math.min(initialIndex, items.length - 1));
    return start === 0 ? items : [...items.slice(start), ...items.slice(0, start)];
  }, [items, initialIndex]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const renderItem = useCallback(
    ({ item, index }: { item: UnifiedFeedItem; index: number }) => (
      <FeedCard item={item} isVisible={index === activeIndex} enablePreview />
    ),
    [activeIndex],
  );

  const keyExtractor = useCallback(
    (item: UnifiedFeedItem, index: number) => String(item.tokenId ?? item.id ?? index),
    [],
  );

  const contentContainerStyle = useMemo(
    () => ({
      paddingTop: GRAB_ROW_HEIGHT + 6,
      paddingHorizontal: 8,
      // topInset is added because the bottom of the sheet hangs that far below
      // the screen until the chrome collapses.
      paddingBottom: bottomInset + topInset + 24,
    }),
    [bottomInset, topInset],
  );

  const renderFooter = useCallback(() => {
    if (!noMore) return null;
    return (
      <View style={styles.footer}>
        <Icon name="Image" size={44} color={colors.neutrals[700]} />
        <Text style={styles.footerText}>You're all caught up</Text>
      </View>
    );
  }, [noMore]);

  return (
    <View style={styles.clip} pointerEvents="box-none">
      <Animated.View style={[styles.sheet, sheetStyle]}>
        <GestureDetector gesture={contentPan}>
          <View style={styles.fill}>
            {contentReady ? (
              <AnimatedFlatList
                ref={listRef}
                data={orderedItems}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={contentContainerStyle}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                onScrollBeginDrag={onScrollBegin}
                onScrollEndDrag={onScrollEnd}
                onMomentumScrollEnd={onScrollEnd}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                onEndReached={loadMore}
                onEndReachedThreshold={2}
                ListFooterComponent={renderFooter}
                // Deliberately not removeClippedSubviews, unlike the feeds: on
                // Android it clips against the parent's *untransformed* bounds,
                // and this list's parent is translated by the full height of
                // the nav chrome, which blanks the rows nearest the fold.
                // windowSize already bounds what stays mounted.
                windowSize={5}
                maxToRenderPerBatch={3}
                // One, not three: the tapped post is rotated to the front, so
                // it is the only card on screen when the sheet lands. The next
                // two used to mount in the same commit as the open and cost it
                // its first frames.
                initialNumToRender={1}
              />
            ) : null}
          </View>
        </GestureDetector>

        <GestureDetector gesture={grabPan}>
          <Animated.View
            style={[styles.grabRow, grabStyle]}
            pointerEvents={handleActive ? "auto" : "none"}
          >
            <View style={styles.grabBar} />
            {showCloseButton && (
              <Pressable
                onPress={close}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityLabel="Close images"
                style={styles.closeBtn}
              >
                <Icon name="X" size={18} color={colors.neutrals[400]} />
              </Pressable>
            )}
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
});

ImageFeedDrawer.displayName = "ImageFeedDrawer";

export default ImageFeedDrawer;

const styles = StyleSheet.create({
  // Clips the strip of sheet that hangs below the screen while the host chrome
  // is still showing, so nothing bleeds past the bottom edge.
  //
  // zIndex sits one below HomeScreen's headerClip (10) on purpose: the nav bar
  // has to keep painting — and taking taps — above the sheet, since staying
  // navigable is the whole point of stopping short of it.
  clip: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9,
    overflow: "hidden",
  },
  sheet: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "100%",
    backgroundColor: colors.neutrals[900],
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    overflow: "hidden",
  },
  fill: { flex: 1 },
  grabRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: GRAB_ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.neutrals[900],
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
  },
  grabBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.neutrals[600],
  },
  closeBtn: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    width: 32,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  footer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  footerText: {
    color: colors.neutrals[500],
    fontSize: 14,
    marginTop: 12,
    fontWeight: "500",
  },
});
