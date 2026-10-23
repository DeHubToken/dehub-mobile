import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, type LayoutChangeEvent } from "react-native";
import { markDislikeGone, useDislikeHidden } from "../../libs/disliked-posts-store";

const HOLD_MS = 180;
const LEAVE_MS = 380;

/**
 * Feed row that folds away when its post is disliked: the card fades and
 * shrinks while its space closes, then the list drops the row (markDislikeGone).
 * Only the feed lists use this — the post page and profiles keep the post.
 */
export function DislikeVanish({ tokenId, children }: { tokenId?: string | number | null; children: React.ReactNode }) {
  const hidden = useDislikeHidden(tokenId);
  const height = useRef(0);
  const progress = useRef(new Animated.Value(0)).current;
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!hidden) {
      progress.setValue(0);
      setLeaving(false);
      return;
    }
    if (tokenId == null) return;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce || height.current <= 0) {
          markDislikeGone(tokenId);
          return;
        }
        setLeaving(true);
        Animated.timing(progress, {
          toValue: 1,
          duration: LEAVE_MS,
          delay: HOLD_MS,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          // Height cannot run on the native driver.
          useNativeDriver: false,
        }).start(({ finished }) => {
          if (finished && !cancelled) markDislikeGone(tokenId);
        });
      });
    return () => {
      cancelled = true;
    };
  }, [hidden, tokenId, progress]);

  const onLayout = (e: LayoutChangeEvent) => {
    if (!leaving) height.current = e.nativeEvent.layout.height;
  };

  if (!leaving) return <Animated.View onLayout={onLayout}>{children}</Animated.View>;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        overflow: "hidden",
        height: progress.interpolate({ inputRange: [0, 1], outputRange: [height.current, 0] }),
        opacity: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0, 0] }),
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}
