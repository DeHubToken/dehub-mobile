import { useContext, useEffect, useState, useSyncExternalStore } from "react";
import { NavigationContext } from "@react-navigation/native";
import { isFeedScrolling, subscribeFeedScrollStart, subscribeFeedSettled } from "../libs/scrollActivity";
import { FeedPlaybackActiveContext, visualActivity } from "../libs/visualActivity";

const subscribeScroll = (fn: () => void) => {
  const a = subscribeFeedScrollStart(fn);
  const b = subscribeFeedSettled(fn);
  return () => { a(); b(); };
};

/**
 * Whether a decorative loop (a live ring, a glow that breathes) may run now.
 *
 * An endless Reanimated loop asks Android for a frame on every vsync, so one
 * ring on screen kept the UI thread drawing the whole window 60 times a
 * second even with nothing moving, and added its work to every frame of a
 * fling. Loops hold while a feed moves, while their screen is behind another
 * one or the app is in the background, and resume when it settles.
 */
export function useAmbientMotion(): boolean {
  const surface = useContext(FeedPlaybackActiveContext);
  const visual = useSyncExternalStore(visualActivity.subscribe, visualActivity.isForeground, () => true);
  const scrolling = useSyncExternalStore(subscribeScroll, isFeedScrolling, () => false);
  // Not useIsFocused: this also renders outside any navigator (sheets, tests).
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused?.() ?? true);
  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const on = navigation.addListener("focus", () => setFocused(true));
    const off = navigation.addListener("blur", () => setFocused(false));
    return () => { on(); off(); };
  }, [navigation]);
  return surface && visual && focused && !scrolling;
}
