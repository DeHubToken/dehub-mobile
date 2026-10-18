import { ScreenNames } from "../navigation/ScreenNames";
import { emitStageDeepLink } from "./deeplink.events";
import type { LiveTarget } from "../hooks/useIsUserLive";

/**
 * Open what a live person is on: their stream in the live viewer, or the
 * Stage they host (through the same path a stage link takes).
 *
 * Imperative for the same reason as `libs/openStagesHub`: avatars render in
 * sheets and rows that hold no navigation prop. App is required lazily so
 * the avatars' modules don't pull the whole app in under tests.
 */
export function openLiveTarget(target: LiveTarget): void {
  if (target.kind === "stage") {
    if (target.id) emitStageDeepLink({ id: target.id });
    return;
  }
  if (!target.streamId) return;
  const { navigationRef } = require("../App");
  if (!navigationRef.isReady()) return;
  navigationRef.navigate(
    ScreenNames.LiveViewer as never,
    {
      streamId: target.streamId,
      isLive: true,
      ...(target.tokenId != null ? { tokenId: target.tokenId } : {}),
    } as never,
  );
}
