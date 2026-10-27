import React, { useCallback, useEffect, useMemo } from "react";
import { BackHandler, PanResponder, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useFocusEffect } from "@react-navigation/native";
import { SheetGlassFill } from "../ui/SheetGlass";
import SheetBackdrop, { useSheetBackdrop } from "../ui/SheetBackdrop";
import { PinDrawerBlurSource } from "../ui/FrostedBackdrop";
import { SHEET_GLASS_BORDER, SHEET_GLASS_FILL } from "../../theme/sheetGlass";

/** The strip of the screen behind that stays visible above the sheet. */
const TOP_GAP = 10;

/**
 * A whole page presented as a drawer, as phone web's bell drawer: a glass
 * sheet over the screen it was opened from, with a handle and no close
 * button. Pulling the handle or the `grab` area down closes it, as do a tap
 * on the strip above and the system back. Host it in a route presented as a
 * transparentModal with no animation; the sheet does all the moving.
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
  /** The top of the page (its header). Drags down here close the sheet;
   *  sideways drags and taps still reach it. */
  grab?: React.ReactNode;
  children: React.ReactNode;
};

function Sheet({ onClose, grab, children }: PageDrawerProps) {
  const { height } = useWindowDimensions();
  const translateY = useSharedValue(height);
  const backdrop = useSharedValue(0);
  // The page behind blurred, as every other drawer has it: without it the
  // sheet's wash was all that stood between its rows and the page.
  const blur = useSheetBackdrop();

  useEffect(() => {
    translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
    backdrop.value = withTiming(1, { duration: 250 });
    // Mount-only: the sheet slides up once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(() => {
    backdrop.value = withTiming(0, { duration: 180 });
    translateY.value = withTiming(height, { duration: 220, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) runOnJS(onClose)();
    });
  }, [backdrop, translateY, height, onClose]);

  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [close]));

  // A responder that only claims clear downward drags, as SheetDismissHandle
  // does: taps and sideways tab scrolls in the header never reach it.
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 10 && g.dy > Math.abs(g.dx) * 1.5,
    onPanResponderMove: (_, g) => {
      translateY.value = Math.max(0, g.dy);
    },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 100 || (g.dy > 20 && g.vy > 0.7)) close();
      else translateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
    },
    onPanResponderTerminate: () => {
      translateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
    },
  }), [translateY, close]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <SheetBackdrop backdrop={blur} />
        <Pressable style={{ flex: 1 }} onPress={close} accessibilityRole="button" />
      </Animated.View>
      <Animated.View style={[styles.sheet, sheetStyle]}>
        <SheetGlassFill backdropBlurred={blur.blurred} style={[StyleSheet.absoluteFill, styles.surface]} />
        <View {...pan.panHandlers}>
          <View style={styles.handleZone}>
            <View style={styles.handle} />
          </View>
          {grab}
        </View>
        <View style={{ flex: 1 }}>{children}</View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  sheet: {
    position: "absolute",
    top: TOP_GAP,
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
  handleZone: { alignItems: "center", paddingTop: 10, paddingBottom: 2 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.4)" },
});
