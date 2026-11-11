import React, { createContext, forwardRef, useCallback, useContext, useEffect, useMemo } from "react";
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from "react-native";
import { Gesture, GestureDetector, type NativeGesture } from "react-native-gesture-handler";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { MOTION, SNAP_SPRING } from "../../theme/motion";
import { useFocusEffect } from "@react-navigation/native";
import { SheetGlassFill } from "../ui/SheetGlass";
import SheetBackdrop, { useSheetBackdrop } from "../ui/SheetBackdrop";
import { PinDrawerBlurSource } from "../ui/FrostedBackdrop";
import { SHEET_GLASS_BORDER, SHEET_GLASS_FILL } from "../../theme/sheetGlass";

/** Share of the screen the sheet covers; the page above shows it is a drawer. */
const SHEET_SHARE = 0.8;
/** Pulled this share of the sheet's height closes on a slow release too. */
const CLOSE_SHARE = 0.25;
/** A flick closes once it has moved the sheet this far... */
const FLICK_MIN_PULL = 72;
/** ...and the finger is still moving down this fast (px/s) when it lets go. */
const FLICK_SPEED = 300;
/** A list scrolled this recently (ms) is still gliding from a fling. */
const SCROLL_SETTLE_MS = 140;

type DrawerList = { gesture: NativeGesture; onScrollY: (y: number) => void };
const DrawerListContext = createContext<DrawerList | null>(null);

/**
 * A whole page presented as a drawer, as phone web's bell drawer: a glass
 * sheet over four fifths of the screen it was opened from, with no handle
 * and no close button. Pulling down anywhere on it closes it once its list
 * is at the top, as do a tap on the page above and the system back. Host it
 * in a route presented as a transparentModal with no animation; the sheet
 * does all the moving.
 *
 * The page's list must scroll in a `PageDrawerScrollView` (FlashList and
 * FlatList: `renderScrollComponent={PageDrawerScrollView}`), so the sheet
 * knows where the list is and can share the finger with it.
 */
export default function PageDrawer(props: PageDrawerProps) {
  return (
    <PinDrawerBlurSource>
      <Sheet {...props} />
    </PinDrawerBlurSource>
  );
}

type PageDrawerProps = {
  onClose: () => void;
  /** The top of the page (its header). */
  grab?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * The drawer's scroll view. No bounce, so a pull at the top moves the sheet
 * and not the rows; outside a PageDrawer it is a plain ScrollView.
 */
export const PageDrawerScrollView = forwardRef<ScrollView, ScrollViewProps>(function PageDrawerScrollView(props, ref) {
  const list = useContext(DrawerListContext);
  const { onScroll } = props;
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    list?.onScrollY(e.nativeEvent.contentOffset.y);
    onScroll?.(e);
  }, [list, onScroll]);
  if (!list) return <ScrollView ref={ref} {...props} />;
  return (
    <GestureDetector gesture={list.gesture}>
      <ScrollView
        ref={ref}
        {...props}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        bounces={false}
        overScrollMode="never"
      />
    </GestureDetector>
  );
});

function Sheet({ onClose, grab, children }: PageDrawerProps) {
  const { height } = useWindowDimensions();
  const sheetTop = Math.round(height * (1 - SHEET_SHARE));
  const sheetHeight = height - sheetTop;
  const translateY = useSharedValue(height);
  const backdrop = useSharedValue(0);
  // The page above stays sharp under a plain dim, not a live blur. On Android
  // the blur re-samples the whole page on every frame anything in the window
  // draws, so scrolling this list paid for a full-screen blur (about 1 in 3
  // frames late on a Galaxy S24+).
  const blur = useSheetBackdrop(false);

  // Where the list is, for the pull rules below.
  const scrollY = useSharedValue(0);
  const lastScrollAt = useSharedValue(0);
  const startedAtTop = useSharedValue(false);
  const pulled = useSharedValue(0);
  const closing = useSharedValue(false);

  useEffect(() => {
    translateY.value = withTiming(0, { duration: MOTION.open, easing: Easing.out(Easing.cubic) });
    backdrop.value = withTiming(1, { duration: MOTION.backdropIn });
    // Mount-only: the sheet slides up once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(() => {
    if (closing.value) return;
    closing.value = true;
    backdrop.value = withTiming(0, { duration: MOTION.backdropOut });
    translateY.value = withTiming(height, { duration: MOTION.close, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) runOnJS(onClose)();
    });
  }, [backdrop, translateY, closing, height, onClose]);

  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [close]));

  const onScrollY = useCallback((y: number) => {
    scrollY.value = y;
    lastScrollAt.value = Date.now();
  }, [scrollY, lastScrollAt]);
  const listGesture = useMemo(() => Gesture.Native(), []);
  const list = useMemo(() => ({ gesture: listGesture, onScrollY }), [listGesture, onScrollY]);

  // Pull down anywhere on the sheet. It shares the finger with the list, and
  // only moves the sheet when the list was at the top (and not still gliding
  // from a fling) as the finger went down, so a swipe that scrolls the list
  // back up and reaches the top stays a scroll. Upward and sideways moves
  // never start it. Past a quarter of the sheet, or a clear flick still
  // moving down, closes; anything less springs back.
  const pan = useMemo(() => Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-16, 16])
    .simultaneousWithExternalGesture(listGesture)
    .onBegin(() => {
      startedAtTop.value = scrollY.value <= 1 && Date.now() - lastScrollAt.value > SCROLL_SETTLE_MS;
      pulled.value = 0;
    })
    .onUpdate((e) => {
      if (!startedAtTop.value || closing.value) return;
      if (pulled.value === 0 && scrollY.value > 1) {
        startedAtTop.value = false;
        return;
      }
      pulled.value = Math.max(0, e.translationY);
      translateY.value = pulled.value;
      backdrop.value = 1 - Math.min(1, pulled.value / sheetHeight);
    })
    .onEnd((e) => {
      const d = pulled.value;
      if (d <= 0 || closing.value) return;
      if (d >= sheetHeight * CLOSE_SHARE || (d >= FLICK_MIN_PULL && e.velocityY >= FLICK_SPEED)) {
        closing.value = true;
        backdrop.value = withTiming(0, { duration: MOTION.backdropOut });
        // Carries on at the finger's speed rather than starting from rest.
        const rest = height - d;
        const speed = Math.max(e.velocityY, 1200);
        translateY.value = withTiming(height, { duration: Math.min(MOTION.close + 60, Math.max(140, (rest / speed) * 1000)), easing: Easing.out(Easing.quad) }, (done) => {
          if (done) runOnJS(onClose)();
        });
      }
    })
    .onFinalize(() => {
      if (!closing.value && pulled.value > 0) {
        translateY.value = withSpring(0, SNAP_SPRING);
        backdrop.value = withTiming(1, { duration: MOTION.backdropIn });
      }
      pulled.value = 0;
    }), [listGesture, startedAtTop, scrollY, lastScrollAt, pulled, closing, translateY, backdrop, sheetHeight, height, onClose]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <SheetBackdrop backdrop={blur} />
        <Pressable style={{ flex: 1 }} onPress={close} accessibilityRole="button" />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.sheet, { top: sheetTop }, sheetStyle]}>
          {/* Near solid on purpose: a list of rows on a 60% wash let the feed's
              pictures read through behind the text. */}
          <SheetGlassFill blur={false} style={[StyleSheet.absoluteFill, styles.surface]} />
          <View style={styles.top}>{grab}</View>
          <DrawerListContext.Provider value={list}>
            <View style={{ flex: 1 }}>{children}</View>
          </DrawerListContext.Provider>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  surface: {
    backgroundColor: SHEET_GLASS_FILL,
    borderTopWidth: 1,
    borderColor: SHEET_GLASS_BORDER,
  },
  // Where the handle was: a little room so the header clears the corners.
  top: { paddingTop: 8 },
});
