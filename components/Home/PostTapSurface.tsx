import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import { TAP_GESTURE_WINDOW_MS, TAP_REACTION_RESOLUTION_MS } from "../../libs/tap-gesture";

/** Keep image navigation pending until a second tap can claim the gesture. */
export default function PostTapSurface({ children, onPress, onReaction, style }: {
  children: React.ReactNode;
  onPress?: () => void;
  onReaction: (reaction: "like" | "love") => void;
  style?: StyleProp<ViewStyle>;
}) {
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
  useEffect(() => () => {
    reset();
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, []);
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
      style={style}
      onTouchStart={(event) => {
        origin.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
        moved.current = false;
      }}
      onTouchMove={checkTravel}
      onTouchCancel={() => { moved.current = true; reset(); }}
      onLongPress={() => { moved.current = true; reset(); }}
      onPress={(event) => {
        event.stopPropagation();
        checkTravel(event);
        if (moved.current) return;
        if (timer.current) clearTimeout(timer.current);
        count.current += 1;
        if (count.current === 1) {
          timer.current = setTimeout(() => { reset(); callbacks.current.onPress?.(); }, TAP_GESTURE_WINDOW_MS);
        } else if (count.current === 2) {
          showFeedback("like");
          timer.current = setTimeout(() => { reset(); callbacks.current.onReaction("like"); }, TAP_REACTION_RESOLUTION_MS);
        } else {
          reset();
          showFeedback("love");
          callbacks.current.onReaction("love");
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
