/**
 * Thumb Nod
 * =========
 * Your own 👍 or 👎: the plain thumb icon gives a small nod once every 5
 * seconds. It tips up from the wrist, settles, and rests. Same motion as web
 * (.dehub-thumb-nod). Native-driver transforms only; it holds still off screen
 * and when the system asks for reduced motion.
 *
 * The rest between nods is a timer, not part of the animation: an
 * Animated.loop with delays keeps the native driver ticking on every vsync,
 * so one liked post on screen redrew the whole window 120 times a second
 * while nothing moved.
 */

import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";
import { useAmbientMotion } from "../../hooks/useAmbientMotion";

const CYCLE_MS = 5000;
// Keyframes as fractions of the cycle: tip, swing back, settle, rest.
const STEPS: { at: number; rotate: number; scale: number }[] = [
  { at: 0.06, rotate: -12, scale: 1.08 },
  { at: 0.12, rotate: 5, scale: 1.02 },
  { at: 0.17, rotate: -2, scale: 1 },
  { at: 0.22, rotate: 0, scale: 1 },
];

export function ThumbNod({
  down = false,
  playing = true,
  children,
}: {
  /** The 👎 is the same hand turned over, so it nods from its wrist at the top. */
  down?: boolean;
  playing?: boolean;
  children: React.ReactNode;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);
  const rotate = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  // Holds while a feed scrolls, behind another screen and in the background.
  const ambient = useAmbientMotion();

  useEffect(() => {
    if (!playing || reduceMotion || !ambient) return;
    let last = 0;
    const steps = STEPS.map((step) => {
      const duration = (step.at - last) * CYCLE_MS;
      last = step.at;
      const timing = { duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true, isInteraction: false };
      return Animated.parallel([
        Animated.timing(rotate, { ...timing, toValue: step.rotate }),
        Animated.timing(scale, { ...timing, toValue: step.scale }),
      ]);
    });
    const nodMs = last * CYCLE_MS;
    let nod: Animated.CompositeAnimation | null = null;
    let timer: ReturnType<typeof setTimeout> = setTimeout(function run() {
      nod = Animated.sequence(steps);
      nod.start(({ finished }) => {
        if (finished) timer = setTimeout(run, CYCLE_MS - nodMs);
      });
    }, 350);
    return () => {
      clearTimeout(timer);
      nod?.stop();
      rotate.setValue(0);
      scale.setValue(1);
    };
  }, [playing, reduceMotion, ambient, rotate, scale]);

  return (
    <Animated.View
      style={{
        transformOrigin: down ? "75% 15%" : "25% 85%",
        transform: [
          { rotate: rotate.interpolate({ inputRange: [-360, 360], outputRange: ["-360deg", "360deg"] }) },
          { scale },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** ThumbNod when `nod` is set, else the icon as it is. */
export function ThumbNodIf({ nod, playing, children }: { nod?: "up" | "down"; playing?: boolean; children: React.ReactNode }) {
  return nod ? <ThumbNod down={nod === "down"} playing={playing}>{children}</ThumbNod> : <>{children}</>;
}
