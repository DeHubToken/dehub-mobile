import React, { useCallback, useEffect } from "react";
import { BackHandler, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useFocusEffect } from "@react-navigation/native";
import { SheetGlassFill } from "../ui/SheetGlass";
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
export default function PageDrawer({
  onClose,
  grab,
  children,
}: {
  onClose: () => void;
  /** The top of the page (its header). Drags down here close the sheet;
   *  sideways drags and taps still reach it. */
  grab?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { height } = useWindowDimensions();
  const translateY = useSharedValue(height);
  const backdrop = useSharedValue(0);

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

  const pan = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetX([-14, 14])
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 600) {
        runOnJS(close)();
      } else {
        translateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={{ flex: 1 }} onPress={close} accessibilityRole="button" />
      </Animated.View>
      <Animated.View style={[styles.sheet, sheetStyle]}>
        <SheetGlassFill style={[StyleSheet.absoluteFill, styles.surface]} />
        <GestureDetector gesture={pan}>
          <View>
            <View style={styles.handleZone}>
              <View style={styles.handle} />
            </View>
            {grab}
          </View>
        </GestureDetector>
        <View style={{ flex: 1 }}>{children}</View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  backdrop: { backgroundColor: "rgba(0,0,0,0.5)" },
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
