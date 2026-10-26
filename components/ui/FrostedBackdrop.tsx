import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { BlurTargetView } from "expo-blur";
import { useFocusEffect } from "@react-navigation/native";
import { useAppTheme } from "../../context/ThemeContext";

type Target = React.RefObject<View | null>;
const Targets = createContext<{ target: Target | undefined; register: (target: Target) => () => void } | null>(null);
const SourceOverride = createContext<Target | null | undefined>(undefined);
export const androidFrostSupported = Platform.OS === "android" && Number(Platform.Version) >= 31;

/** Keep the WebView backdrop out of native blur capture; only native feeds are sampled. */
export function FrostedBackdropProvider({ backdrop, children }: { backdrop: React.ReactNode; children: React.ReactNode }) {
  const [target, setTarget] = useState<Target | undefined>(undefined);
  const register = useCallback((next: Target) => {
    setTarget(next);
    return () => setTarget(current => current === next ? undefined : current);
  }, []);
  const value = useMemo(() => ({ target, register }), [target, register]);
  return (
    <Targets.Provider value={value}>
      {backdrop}
      {children}
    </Targets.Provider>
  );
}

export function useFrostedSource(): Target | undefined {
  const targets = useContext(Targets);
  const override = useContext(SourceOverride);
  return override === undefined ? targets?.target : override ?? undefined;
}

/**
 * The feed a drawer can blur. A drawer opens in its own Modal window, outside
 * the feed's BlurTargetView, so it may sample the feed even when it is mounted
 * from inside one (where useFrostedSource says no, to stop nested capture).
 * Undefined off Android 12+, or while no feed screen is focused.
 */
export function useDrawerBlurSource(): Target | undefined {
  const targets = useContext(Targets);
  return androidFrostSupported ? targets?.target : undefined;
}

/** Standalone overlays must not keep sampling the covered page's feed. */
export function FrostedBackground({ children }: { children: React.ReactNode }) {
  return <SourceOverride.Provider value={null}>{children}</SourceOverride.Provider>;
}

/** Register visible feed content for sibling navigation pills and the bottom bar. */
export function FrostedContent({ children }: { children: React.ReactNode }) {
  const ref = useRef<View>(null);
  const targets = useContext(Targets);
  const register = targets?.register;
  const { isLight, colors } = useAppTheme();
  useFocusEffect(useCallback(() => {
    if (androidFrostSupported && register) return register(ref);
  }, [register]));
  if (!androidFrostSupported) return <>{children}</>;
  return (
    // The blur target draws its children on its own layer, and on Android the
    // empty parts of that layer come out black instead of showing the page
    // underneath. Dark themes hide it; System Light got a black feed. So it
    // carries the page colour itself (the dark value: System Light's colour
    // pass turns it white).
    <BlurTargetView ref={ref} style={{ flex: 1, backgroundColor: isLight ? colors.background : undefined }}>
      {/* Nested glass uses its static material instead of recursively capturing
          the feed or replaying the WebView backdrop into a blur RenderNode. */}
      <SourceOverride.Provider value={null}>
        {children}
      </SourceOverride.Provider>
    </BlurTargetView>
  );
}
