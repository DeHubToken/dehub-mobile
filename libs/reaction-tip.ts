/**
 * One-time hint that the like button hides more reactions.
 *
 * Shown after the viewer's first plain like, since that is the moment they
 * have found the button but not the tray behind it. Anyone who has already
 * held it open knows, so that marks it seen without a toast.
 */
import i18n from "i18next";
import { storage } from "./storage";
import { toastInfo } from "./toast";

const SEEN_KEY = "dehub:reaction-tip-seen";

export function markReactionTipSeen(): void {
  storage.set(SEEN_KEY, true);
}

export function maybeShowReactionTip(): void {
  if (storage.getBoolean(SEEN_KEY)) return;
  markReactionTipSeen();
  toastInfo(i18n.t("feedCard.reactionTip"), { duration: 5000 });
}
