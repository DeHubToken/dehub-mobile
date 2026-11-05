import React, { useEffect, useRef } from "react";
import { View, ViewProps } from "react-native";

/**
 * Wraps the row a notification pointed at. Once it has laid out (and the
 * content above it has had a moment to settle) it reports where it sits on
 * screen, once, so the screen around it can scroll it into the middle.
 *
 * Window coordinates rather than a layout offset, because the row is nested
 * several Views deep inside a list header or a ScrollView and its own
 * `onLayout` y is only relative to its parent.
 */
export default function FocusAnchor({
  active,
  onMeasured,
  children,
  ...rest
}: ViewProps & { active: boolean; onMeasured?: (windowY: number, height: number) => void }) {
  const ref = useRef<View>(null);
  const done = useRef(false);
  useEffect(() => {
    if (!active || done.current || !onMeasured) return;
    const timer = setTimeout(() => {
      ref.current?.measureInWindow((_x, y, _w, h) => {
        if (done.current || !Number.isFinite(y)) return;
        done.current = true;
        onMeasured(y, h);
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [active, onMeasured]);
  return (
    <View ref={ref} collapsable={false} {...rest}>
      {children}
    </View>
  );
}
