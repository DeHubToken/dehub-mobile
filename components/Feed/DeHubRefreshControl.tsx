import React, { useContext, useEffect, useRef, useState } from "react";
import { NavigationContext } from "@react-navigation/native";
import { Platform, RefreshControl, type RefreshControlProps } from "react-native";
import { setFeedPillRefreshing } from "../../libs/feed-pill-refresh";
import { HomePullRefreshContext } from "../../context/HomePullRefreshContext";

const HIDDEN = "transparent";
// Android gives the native disc elevation even when its colours are transparent.
const HIDDEN_ANDROID_INDICATOR_OFFSET = -1000;

/** Keep the native pull gesture; only the navigation logo draws refresh feedback. */
export const DeHubRefreshControl = ({
  refreshing,
  tintColor,
  colors,
  progressBackgroundColor,
  onRefresh,
  ...rest
}: RefreshControlProps) => {
  const home = useContext(HomePullRefreshContext);
  useEffect(() => {
    if (home?.enabled && onRefresh) return home.register(onRefresh);
  }, [home, onRefresh]);
  return (
  <RefreshControl
    {...rest}
    enabled={home?.enabled ? false : rest.enabled}
    refreshing={home?.enabled ? false : refreshing}
    onRefresh={onRefresh}
    tintColor={HIDDEN}
    colors={[HIDDEN]}
    progressBackgroundColor={HIDDEN}
    progressViewOffset={Platform.OS === 'android' ? HIDDEN_ANDROID_INDICATOR_OFFSET : rest.progressViewOffset}
  />
  );
};

interface DeHubRefreshMarkProps {
  /** False for an inactive Home pager tab, so background refreshes do not animate the logo. */
  pill?: boolean;
  refreshing: boolean;
  /** Legacy layout props retained for existing callers; no floating mark is drawn. */
  topInset?: number;
  size?: number;
}

/** State bridge for existing lists. Refresh feedback stays inside the header logo. */
export const DeHubRefreshMark = ({ pill = true, refreshing }: DeHubRefreshMarkProps) => {
  const id = useRef(Symbol("feed-refresh")).current;
  // Only the screen in front lights the logo and the pill glow. Screens kept
  // mounted behind Home (preloaded tabs, kept profile tabs, pages under a
  // drawer) used to keep it breathing, an endless UI-thread animation that
  // redrew the whole window ~67 times a second with nothing on screen moving.
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused?.() ?? true);
  useEffect(() => {
    if (!navigation?.addListener) return;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener("focus", () => setFocused(true));
    const offBlur = navigation.addListener("blur", () => setFocused(false));
    return () => { offFocus(); offBlur(); };
  }, [navigation]);
  // A refresh that never reports back must not glow forever either.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setTimedOut(false);
    if (!refreshing) return;
    const timer = setTimeout(() => setTimedOut(true), MAX_GLOW_MS);
    return () => clearTimeout(timer);
  }, [refreshing]);
  const lit = pill && refreshing && focused && !timedOut;
  useEffect(() => {
    setFeedPillRefreshing(id, lit);
    return () => setFeedPillRefreshing(id, false);
  }, [id, lit]);
  return null;
};

/** Longest the logo and pill glow show for one refresh. */
const MAX_GLOW_MS = 12_000;

export default DeHubRefreshControl;
