import React, { useEffect, useRef } from "react";
import { RefreshControl, type RefreshControlProps } from "react-native";
import { setFeedPillRefreshing } from "../../libs/feed-pill-refresh";

const HIDDEN = "transparent";

/** Keep the native pull gesture; only the navigation logo draws refresh feedback. */
export const DeHubRefreshControl = ({
  refreshing,
  tintColor,
  colors,
  progressBackgroundColor,
  ...rest
}: RefreshControlProps) => (
  <RefreshControl
    {...rest}
    refreshing={refreshing}
    tintColor={HIDDEN}
    colors={[HIDDEN]}
    progressBackgroundColor={HIDDEN}
  />
);

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

