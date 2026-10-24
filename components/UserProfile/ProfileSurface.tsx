import React, { useEffect, useState } from "react";
import { BackHandler, Modal, Platform, StyleSheet, useWindowDimensions } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Slide in, slide out. The page under the profile comes back when this ends. */
export const PROFILE_OPEN_MS = 220;
export const PROFILE_CLOSE_MS = 180;

/** Keep Android media in the activity window, where AppState can track focus. */
export default function ProfileSurface({ visible, onClose, children }: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (Platform.OS !== "android") {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}
        presentationStyle="fullScreen" statusBarTranslucent>
        {children}
      </Modal>
    );
  }
  return <AndroidProfileSurface visible={visible} onClose={onClose}>{children}</AndroidProfileSurface>;
}

/**
 * The slide runs on the UI thread. It used to be react-native-modal without
 * its native driver, which stepped the slide from JavaScript: the same thread
 * that was mounting the profile and parsing its account, so the page started
 * late and stuttered on the way in, and going back waited out the full 300ms.
 */
function AndroidProfileSurface({ visible, onClose, children }: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const offset = useSharedValue(visible ? 0 : height);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      offset.value = withTiming(0, { duration: PROFILE_OPEN_MS, easing: Easing.out(Easing.cubic) });
      return;
    }
    offset.value = withTiming(height, { duration: PROFILE_CLOSE_MS, easing: Easing.in(Easing.quad) }, (finished) => {
      if (finished) runOnJS(setMounted)(false);
    });
  }, [visible, height, offset]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  // Rendered in the same commit as the tap, not an effect later.
  if (!visible && !mounted) return null;
  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[StyleSheet.absoluteFill, {
        top: -insets.top, bottom: -insets.bottom,
        left: -insets.left, right: -insets.right,
      }, slide]}>
      {children}
    </Animated.View>
  );
}
