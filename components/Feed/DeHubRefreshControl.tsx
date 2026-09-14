/**
 * Branded pull-to-refresh
 * =======================
 * The stock Android/iOS refresh spinner is the one wait in the app that still
 * looked like a system dialog rather than DeHub. This swaps the *indicator*
 * for the DeHub mark — the same animation the web app shows whenever a feed
 * reloads — while leaving the gesture itself alone.
 *
 * Why the gesture stays native: these feeds run
 * `maintainVisibleContentPosition`, a hand-tuned momentum pipeline and a
 * collapsing header that reads raw scroll offsets. A custom pan responder
 * would have to win all three back, and the only thing being bought is a logo.
 *
 * How the handover works: while the finger is still dragging, the native
 * indicator is the thing that answers it — that is the affordance that tells
 * you the pull has been registered and how far is far enough. The moment the
 * release fires and the request is actually in flight, the native indicator's
 * colours go transparent and `DeHubRefreshMark` paints the DeHub mark in the
 * space it was occupying. Both colour props apply live on Android
 * (`setColorSchemeColors` / `setProgressBackgroundColorSchemeColor`), so the
 * swap lands on the same frame the spin would have started.
 *
 * Usage is two parts, because `RefreshControl` can only be handed to the list
 * through `refreshControl` and cannot render siblings of its own:
 *
 *     <View className="flex-1">
 *       <FlatList refreshControl={<DeHubRefreshControl … />} … />
 *       <DeHubRefreshMark refreshing={refreshing} topInset={headerInset} />
 *     </View>
 */

import React from "react";
import { RefreshControl, RefreshControlProps, StyleSheet, View } from "react-native";
import { DeHubLoader } from "../DeHubLoader";

const HIDDEN = "transparent";
const DEFAULT_TINT = "#FFFFFF";

/** Mark size. Close to the native circle's 40 dp so nothing shifts. */
const MARK_SIZE = 38;

/**
 * Distance from the refresh origin down to the mark's box. The native circle
 * settles roughly this far below `progressViewOffset`; matching it keeps the
 * wait in the place the eye is already looking after a pull.
 */
const MARK_DROP = 8;

export const DeHubRefreshControl = ({
  refreshing,
  tintColor,
  colors,
  progressBackgroundColor,
  ...rest
}: RefreshControlProps) => {
  const idle = tintColor ?? DEFAULT_TINT;
  return (
    <RefreshControl
      {...rest}
      refreshing={refreshing}
      // iOS
      tintColor={refreshing ? HIDDEN : idle}
      // Android: the arrow and the disc behind it. Both are left exactly as the
      // caller had them while the finger is down, so a screen that tuned the
      // disc to its own surface keeps that look for the part of the gesture
      // that is still native.
      colors={refreshing ? [HIDDEN] : (colors ?? [idle])}
      progressBackgroundColor={refreshing ? HIDDEN : progressBackgroundColor}
    />
  );
};

interface DeHubRefreshMarkProps {
  refreshing: boolean;
  /**
   * Where the refresh indicator starts — the same value the list passes to
   * `progressViewOffset`, i.e. the height of whatever chrome sits above it.
   */
  topInset?: number;
  size?: number;
}

export const DeHubRefreshMark = ({
  refreshing,
  topInset = 0,
  size = MARK_SIZE,
}: DeHubRefreshMarkProps) => {
  if (!refreshing) return null;
  return (
    <View
      // Never eats a touch: the list underneath stays scrollable mid-refresh.
      pointerEvents="none"
      style={[styles.wrap, { top: topInset + MARK_DROP }]}
    >
      <DeHubLoader size={size} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    // The rows it sits over are absolutely positioned in some of these feeds,
    // so tree order alone does not keep it on top on Android.
    zIndex: 30,
    elevation: 30,
  },
});

export default DeHubRefreshControl;
