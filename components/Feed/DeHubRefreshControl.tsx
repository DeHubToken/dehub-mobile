import React, { useContext, useEffect, useRef } from "react";
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
  useEffect(() => {
    setFeedPillRefreshing(id, pill && refreshing);
    return () => setFeedPillRefreshing(id, false);
  }, [id, pill, refreshing]);
  return null;
};

export default DeHubRefreshControl;
