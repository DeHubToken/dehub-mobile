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
  // A feed opened over another one while both stay focused (a post opened in
  // place on Home) registers on top; closing it hands the pills back to the
  // feed underneath instead of leaving them with nothing to blur.
  const stack = useRef<Target[]>([]);
  const register = useCallback((next: Target) => {
    stack.current = [...stack.current.filter(t => t !== next), next];
    setTarget(next);
    return () => {
      stack.current = stack.current.filter(t => t !== next);
      setTarget(stack.current[stack.current.length - 1]);
    };
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
  const pinned = useContext(PinnedSource);
  return androidFrostSupported ? pinned ?? targets?.target : undefined;
}

const PinnedSource = createContext<Target | undefined>(undefined);

/**
 * For a drawer that is a route of its own (a transparentModal screen): the
 * screen it opens over loses focus and unregisters its feed, though it stays
 * on screen behind the sheet. Keep blurring the feed that was up when the
 * drawer opened instead of dropping to no blur.
 */
export function PinDrawerBlurSource({ children }: { children: React.ReactNode }) {
  const targets = useContext(Targets);
  const [pinned] = useState(() => targets?.target);
  return <PinnedSource.Provider value={pinned}>{children}</PinnedSource.Provider>;
}

/** Standalone overlays must not keep sampling the covered page's feed. */
export function FrostedBackground({ children, when = true }: { children: React.ReactNode; when?: boolean }) {
  // Always the same element, so switching it on and off never remounts what's inside.
  const outer = useContext(SourceOverride);
  return <SourceOverride.Provider value={when ? null : outer}>{children}</SourceOverride.Provider>;
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
