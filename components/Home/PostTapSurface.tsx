import React, { memo, useEffect, useRef, useState } from "react";
import { Pressable, Text, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import { isInTapReactionCenter, TAP_GESTURE_WINDOW_MS, TAP_REACTION_RESOLUTION_MS } from "../../libs/tap-gesture";

/** Only central taps wait for a reaction; the rest of the post opens immediately. */
function PostTapSurface({ children, onPress, onReaction, style, resetKey, onPressIntent, accessibilityLabel }: {
  children: React.ReactNode;
  onPress?: () => void;
  onPressIntent?: () => void;
  accessibilityLabel?: string;
  onReaction: (reaction: "like" | "love") => void;
  style?: StyleProp<ViewStyle>;
  /** Which post this is, for a list that reuses one card for another. */
  resetKey?: string;
}) {
  const surface = useRef<View>(null);
  const size = useRef({ width: 0, height: 0 });
  const generation = useRef(0);
  const count = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const callbacks = useRef({ onPress, onReaction });
  callbacks.current = { onPress, onReaction };
  const [feedback, setFeedback] = useState<"like" | "love" | null>(null);
  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    count.current = 0;
  };
  // A tap still pending when the card is handed another post (or unmounts)
  // is dropped, along with its emoji: the timer would otherwise open or react
  // to whichever post the callbacks point at by then.
  useEffect(() => () => {
    generation.current += 1;
    reset();
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback(null);
  }, [resetKey]);
  const showFeedback = (reaction: "like" | "love") => {
    setFeedback(reaction);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 1100);
  };
  const checkTravel = (event: GestureResponderEvent) => {
    const start = origin.current;
    if (start && Math.hypot(event.nativeEvent.pageX - start.x, event.nativeEvent.pageY - start.y) > 14) {
      moved.current = true;
      reset();
    }
  };
  return (
    <Pressable
      ref={surface}
      style={style}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      onLayout={(event) => { size.current = event.nativeEvent.layout; }}
      onTouchStart={(event) => {
        origin.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
        moved.current = (event.nativeEvent.touches?.length ?? 1) > 1;
        if (moved.current) reset();
      }}
      onTouchMove={checkTravel}
      onTouchCancel={() => { generation.current += 1; moved.current = true; reset(); }}
      onLongPress={() => { moved.current = true; reset(); }}
      onPress={(event) => {
        event.stopPropagation();
        checkTravel(event);
        if (moved.current) return;
        const { pageX, pageY, locationX, locationY } = event.nativeEvent;
        const currentGeneration = generation.current;
        const finishTap = (central: boolean) => {
          if (currentGeneration !== generation.current) return;
          if (!central) {
            reset();
            onPressIntent?.();
            callbacks.current.onPress?.();
            return;
          }
          if (timer.current) clearTimeout(timer.current);
          count.current += 1;
          if (count.current === 1) {
            onPressIntent?.();
            timer.current = setTimeout(() => { reset(); callbacks.current.onPress?.(); }, TAP_GESTURE_WINDOW_MS);
          } else if (count.current === 2) {
            showFeedback("like");
            timer.current = setTimeout(() => { reset(); callbacks.current.onReaction("like"); }, TAP_REACTION_RESOLUTION_MS);
          } else {
            reset();
            showFeedback("love");
            callbacks.current.onReaction("love");
          }
        };
        // Text/image descendants can be the native event target: locationX/Y
        // then belong to that child. Measure the owning surface and use page
        // coordinates so its reaction zone does not move with the child.
        if (surface.current?.measureInWindow && Number.isFinite(pageX) && Number.isFinite(pageY)) {
          surface.current.measureInWindow((left, top, width, height) => {
            finishTap(isInTapReactionCenter(pageX - left, pageY - top, width, height));
          });
        } else {
          finishTap(isInTapReactionCenter(locationX, locationY, size.current.width, size.current.height));
        }
      }}
    >
      {children}
      {feedback && (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 54 }}>{feedback === "love" ? "❤️" : "👍"}</Text>
        </View>
      )}
    </Pressable>
  );
}

// Callbacks are read through a ref, so a memo here is safe: a fresh arrow from
// the parent never needs a re-render to take effect.
export default memo(PostTapSurface);
