import React, { useCallback } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

/**
 * Holding a slider makes it grow and sit on a pane of glass, so a thumb under a
 * finger is easy to steer. iPhone gets this for free: on iOS 26 the system
 * slider turns into liquid glass while it is held. Android's slider does
 * nothing of the sort, so this draws the same thing around it there. iOS is
 * left with the native effect untouched.
 */
export const GlassHold: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ children, style }) => {
  const held = useSharedValue(0);
  const press = useCallback(() => { held.value = withTiming(1, { duration: 160 }); }, [held]);
  const release = useCallback(() => { held.value = withTiming(0, { duration: 220 }); }, [held]);

  const grow = useAnimatedStyle(() => ({ transform: [{ scale: 1 + held.value * 0.14 }] }));
  const pane = useAnimatedStyle(() => ({ opacity: held.value, transform: [{ scaleY: 0.7 + held.value * 0.3 }] }));

  if (Platform.OS === "ios") return <View style={style}>{children}</View>;

  return (
    <Animated.View
      style={[style, grow]}
      onTouchStart={press}
      onTouchEnd={release}
      onTouchCancel={release}
    >
      <Animated.View pointerEvents="none" style={[styles.pane, pane]} />
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  pane: {
    position: "absolute",
    left: -8,
    right: -8,
    top: "50%",
    height: 34,
    marginTop: -17,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.45)",
  },
});
