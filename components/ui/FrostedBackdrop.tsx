import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BlurTargetView } from "expo-blur";
import { useFocusEffect } from "@react-navigation/native";

type Target = React.RefObject<View | null>;
const Targets = createContext<{ target: Target; background: Target; register: (target: Target) => () => void } | null>(null);
const SourceOverride = createContext<Target | null>(null);
export const androidFrostSupported = Platform.OS === "android" && Number(Platform.Version) >= 31;

/** A source that contains only the theme backdrop, never the glass sampling it. */
export function FrostedBackdropProvider({ backdrop, children }: { backdrop: React.ReactNode; children: React.ReactNode }) {
  const background = useRef<View>(null);
  const [target, setTarget] = useState<Target>(background);
  const register = useCallback((next: Target) => {
    setTarget(next);
    return () => setTarget(current => current === next ? background : current);
  }, []);
  const value = useMemo(() => ({ target, background, register }), [target, register]);
  return (
    <Targets.Provider value={value}>
      {androidFrostSupported ? (
        <BlurTargetView ref={background} style={StyleSheet.absoluteFill} pointerEvents="none">
          {backdrop}
        </BlurTargetView>
      ) : backdrop}
      {children}
    </Targets.Provider>
  );
}

export function useFrostedSource(): Target | undefined {
  const targets = useContext(Targets);
  const override = useContext(SourceOverride);
  return override ?? targets?.target;
}

/** Register visible feed content for sibling navigation pills and the bottom bar. */
export function FrostedContent({ children }: { children: React.ReactNode }) {
  const ref = useRef<View>(null);
  const targets = useContext(Targets);
  const register = targets?.register;
  useFocusEffect(useCallback(() => {
    if (androidFrostSupported && register) return register(ref);
  }, [register]));
  if (!androidFrostSupported) return <>{children}</>;
  return (
    <BlurTargetView ref={ref} style={{ flex: 1 }}>
      {/* Glass inside this source samples the separate theme backdrop, so a
          video control cannot recursively draw its own containing feed. */}
      <SourceOverride.Provider value={targets?.background ?? null}>
        {children}
      </SourceOverride.Provider>
    </BlurTargetView>
  );
}
