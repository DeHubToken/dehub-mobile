import React, { useEffect, useState } from "react";
import { Modal, Platform, StyleSheet } from "react-native";
import { useBackPress } from "../../hooks/useBackPress";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Keep profile motion short enough to follow the tap and the back gesture. */
export const PROFILE_OPEN_MS = 220;
export const PROFILE_CLOSE_MS = 180;

/** Keep Android media in the activity window, where AppState can track focus. */
export default function ProfileSurface({ visible, keepMounted, onClose, onOpenComplete, onCloseComplete, children }: {
  visible: boolean;
  /** Android: stay built while hidden, so the same profile can come straight back. */
  keepMounted?: boolean;
  onClose: () => void;
  onOpenComplete?: () => void;
  /** Android: the page has finished fading away and is no longer drawn. */
  onCloseComplete?: () => void;
  children: React.ReactNode;
}) {
  if (Platform.OS !== "android") {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={onOpenComplete}
        presentationStyle="fullScreen" statusBarTranslucent>
        {children}
      </Modal>
    );
  }
  return <AndroidProfileSurface visible={visible} keepMounted={keepMounted} onClose={onClose} onOpenComplete={onOpenComplete} onCloseComplete={onCloseComplete}>{children}</AndroidProfileSurface>;
}

/**
 * Expand from the centre on the UI thread, keeping the source page behind it.
 * The full-height slide made an ordinary profile feel like a modal sheet.
 */
function AndroidProfileSurface({ visible, keepMounted, onClose, onOpenComplete, onCloseComplete, children }: {
  visible: boolean;
  keepMounted?: boolean;
  onClose: () => void;
  onOpenComplete?: () => void;
  onCloseComplete?: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, { duration: PROFILE_OPEN_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished && onOpenComplete) runOnJS(onOpenComplete)();
      });
      return;
    }
    progress.value = withTiming(0, { duration: PROFILE_CLOSE_MS, easing: Easing.in(Easing.quad) }, (finished) => {
      if (!finished) return;
      runOnJS(setMounted)(false);
      if (onCloseComplete) runOnJS(onCloseComplete)();
    });
  }, [visible, progress, onOpenComplete, onCloseComplete]);

  useBackPress(onClose, visible);

  const motion = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 16 }, { scale: 0.94 + progress.value * 0.06 }],
  }));

  // Rendered in the same commit as the tap, not an effect later.
  if (!visible && !mounted && !keepMounted) return null;
  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      style={[StyleSheet.absoluteFill, {
        top: -insets.top, bottom: -insets.bottom,
        left: -insets.left, right: -insets.right,
      }, motion]}>
      {children}
    </Animated.View>
  );
}
