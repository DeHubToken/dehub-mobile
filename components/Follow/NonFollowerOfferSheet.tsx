import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import PrimaryButton from "../ui/PrimaryButton";

export type NonFollowerOfferStage = "offer" | "confirm" | "working" | "done" | "error";

export interface NonFollowerOfferSheetProps {
  visible: boolean;
  onClose: () => void;
  stage: NonFollowerOfferStage;
  /** People you follow who do not follow you back. */
  count: number;
  done?: number;
  failed?: number;
  onAsk: () => void;
  onConfirm: () => void;
  onBack: () => void;
  onNotNow: () => void;
}

/**
 * "Unfollow all N accounts not following you back": offer, a second tap to
 * confirm, progress while the server works through them, then the result.
 * Same copy and steps as web (NonFollowerOfferSheet.tsx).
 */
export function NonFollowerOfferSheet({ visible, onClose, stage, count, done = 0, failed = 0, onAsk, onConfirm, onBack, onNotNow }: NonFollowerOfferSheetProps) {
  const { t } = useTranslation();

  const title = stage === "done"
    ? t("follow.nonFollowers.doneTitle", "All cleared")
    : stage === "confirm"
      ? t("follow.nonFollowers.confirmTitle", { defaultValue: "Unfollow {{count}} accounts?", count })
      : t("follow.nonFollowers.title", "Clean up who you follow?");

  const body = stage === "done"
    ? (failed > 0
      ? t("follow.nonFollowers.doneSome", { defaultValue: "Unfollowed {{done}} accounts. {{failed}} could not be unfollowed.", done, failed })
      : t("follow.nonFollowers.doneAll", { defaultValue: "Unfollowed {{done}} accounts that were not following you back.", done }))
    : stage === "working"
      ? t("follow.nonFollowers.working", { defaultValue: "Unfollowing {{done}} of {{total}}...", done, total: count })
      : stage === "error"
        ? t("follow.nonFollowers.failed", "Could not start. Try again in a minute.")
        : stage === "confirm"
          ? t("follow.nonFollowers.confirmBody", "They will not be told. You can follow anyone again later.")
          : t("follow.nonFollowers.body", { defaultValue: "{{count}} accounts you follow do not follow you back.", count });

  const progress = count > 0 ? Math.min(1, (done + failed) / count) : 0;

  const ghost = (label: string, onPress: () => void) => (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" style={s.ghost}>
      <Text style={s.ghostText}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom">
      <View style={s.body} testID={`non-follower-offer-${stage}`}>
        <Text style={s.title}>{title}</Text>
        <View style={s.tile}>
          <Icon name={stage === "done" ? "Check" : "UserMinus"} size={36} color="#FFFFFF" />
        </View>
        {stage === "offer" && <Text style={s.count}>{count}</Text>}
        <Text style={s.copy} accessibilityLiveRegion="polite">{body}</Text>
        {stage === "working" && (
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        )}
        <View style={s.actions}>
          {stage === "offer" && (
            <>
              <PrimaryButton large title={t("follow.nonFollowers.cta", { defaultValue: "Unfollow all {{count}}", count })} onPress={onAsk} />
              {ghost(t("follow.nonFollowers.notNow", "Not now"), onNotNow)}
            </>
          )}
          {stage === "confirm" && (
            <>
              <TouchableOpacity onPress={onConfirm} accessibilityRole="button" style={s.danger}>
                <Text style={s.dangerText}>{t("follow.nonFollowers.confirm", { defaultValue: "Yes, unfollow {{count}}", count })}</Text>
              </TouchableOpacity>
              {ghost(t("follow.nonFollowers.cancel", "Cancel"), onBack)}
            </>
          )}
          {stage === "working" && ghost(t("follow.nonFollowers.background", "Keep going in the background"), onClose)}
          {stage === "error" && (
            <>
              <PrimaryButton large title={t("common.tryAgain", "Try again")} onPress={onConfirm} />
              {ghost(t("follow.nonFollowers.close", "Close"), onClose)}
            </>
          )}
          {stage === "done" && <PrimaryButton large title={t("follow.nonFollowers.close", "Close")} onPress={onClose} />}
        </View>
      </View>
    </GlassModal>
  );
}

export default NonFollowerOfferSheet;

const s = StyleSheet.create({
  body: { alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 16 },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", textAlign: "center" },
  tile: {
    width: 80, height: 80, borderRadius: 22, marginTop: 4, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  count: { color: "#FFFFFF", fontSize: 36, fontWeight: "700", marginTop: -4, fontVariant: ["tabular-nums"] },
  copy: { color: "#A1A1AA", fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 300 },
  track: { alignSelf: "stretch", height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.8)" },
  actions: { alignSelf: "stretch", gap: 6 },
  ghost: { height: 46, alignItems: "center", justifyContent: "center" },
  ghostText: { color: "#FFFFFF", fontSize: 15, fontWeight: "500" },
  danger: {
    height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.22)", borderWidth: 1, borderColor: "rgba(248,113,113,0.4)",
  },
  dangerText: { color: "#FEE2E2", fontSize: 16, fontWeight: "600" },
});
