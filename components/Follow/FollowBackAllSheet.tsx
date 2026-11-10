import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import PrimaryButton from "../ui/PrimaryButton";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import { useAppTheme } from "../../context/ThemeContext";

export type FollowBackAllStage = "confirm" | "working" | "done";

export interface FollowBackAllSheetProps {
  stage: FollowBackAllStage | null;
  /** Followers you don't follow yet. */
  count: number;
  completed: number;
  followed: number;
  failed: number;
  onConfirm: () => void;
  onClose: () => void;
}

/** How long the "done" sheet stays before it tucks itself away. */
const DONE_LINGER_MS = 2600;

/**
 * The small drawer "Follow back all" raises: how many people, a tap to
 * confirm, progress, then a tick. Same copy and steps as web
 * (components/app/profile/FollowBackAllSheet.tsx).
 */
export function FollowBackAllSheet({ stage, count, completed, followed, failed, onConfirm, onClose }: FollowBackAllSheetProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (stage !== "done") return;
    const timer = setTimeout(onClose, DONE_LINGER_MS);
    return () => clearTimeout(timer);
  }, [stage, onClose]);

  const title = stage === "done"
    ? t("follow.followedBackCount", { count: followed, defaultValue: "Followed back {{count}} people" })
    : t("follow.followBackConfirmTitle", { count, defaultValue: "Follow back {{count}} people?" });

  const body = stage === "done"
    ? (failed > 0
      ? t("follow.followedBackSome", { defaultValue: "Followed back {{followed}} people; {{failed}} failed", followed, failed })
      : t("follow.followBackDoneBody", "You can find them all in Following."))
    : stage === "working"
      ? t("follow.followingBackProgress", { defaultValue: "Following back {{completed}} of {{total}}", completed, total: count })
      : t("follow.followBackConfirmBody", "They already follow you. Private accounts get a follow request.");

  const progress = count > 0 ? Math.min(1, completed / count) : 0;

  return (
    <GlassModal visible={!!stage} onClose={stage === "working" ? () => {} : onClose} presentation="bottom">
      <View style={s.body} testID={`follow-back-all-${stage ?? "closed"}`}>
        <View style={s.tile}>
          <Icon name={stage === "done" ? "Check" : "UserPlus"} size={32} color="#FFFFFF" />
        </View>
        <Text style={s.title}>{title}</Text>
        <Text style={s.copy} accessibilityLiveRegion="polite">{body}</Text>
        {stage === "working" && (
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        )}
        <View style={s.actions}>
          {stage === "confirm" && (
            <>
              <PrimaryButton large title={t("follow.followBackConfirm", "Follow back")} onPress={onConfirm} />
              <TouchableOpacity onPress={onClose} accessibilityRole="button" style={s.ghost}>
                <Text style={s.ghostText}>{t("follow.followBackNotNow", "Not now")}</Text>
              </TouchableOpacity>
            </>
          )}
          {stage === "done" && <PrimaryButton large title={t("follow.followBackDone", "Done")} onPress={onClose} />}
        </View>
      </View>
    </GlassModal>
  );
}

export interface FollowBackAllButtonProps {
  onPress: () => void;
  /** Counting who is left to follow back. */
  finding: boolean;
  /** Following them back. */
  working: boolean;
  completed: number;
  total: number;
  /** Bumps each time the button should play its arrival shake. */
  nudgeKey: number;
}

/**
 * The white "Follow back all" bar. A short, decaying side-to-side nudge each
 * time nudgeKey changes; skipped when the phone asks for reduced motion.
 * Same shape as the web's follow-back-nudge keyframes.
 */
export function FollowBackAllButton({ onPress, finding, working, completed, total, nudgeKey }: FollowBackAllButtonProps) {
  const { t } = useTranslation();
  const { skin } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const shift = useSharedValue(0);

  useEffect(() => {
    if (!nudgeKey || reducedMotion) return;
    const step = (to: number, ms: number) => withTiming(to, { duration: ms, easing: Easing.out(Easing.quad) });
    shift.value = withSequence(step(-5, 85), step(4, 100), step(-3, 100), step(2, 100), step(-1, 100), step(0, 135));
  }, [nudgeKey, reducedMotion, shift]);

  const nudgeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shift.value }, { rotate: `${shift.value * 0.24}deg` }],
  }));

  const busy = working || finding;
  const ink = busy ? "#A1A1AA" : skin?.centreIcon ?? "#FFFFFF";
  return (
    <Animated.View style={nudgeStyle}>
      <TouchableOpacity
        onPress={onPress}
        disabled={busy}
        activeOpacity={0.85}
        accessibilityRole="button"
        testID="follow-back-all"
        style={[s.barTouch, busy && s.barBusy]}
      >
        <AccentButtonGradient style={s.bar} borderRadius={12} neutral={busy}>
          {busy ? (
            <ActivityIndicator size="small" color={ink} />
          ) : (
            <Ionicons name="people-outline" size={18} color={ink} />
          )}
          <Text style={[s.barLabel, { color: ink }]}>
            {working && total > 0
              ? t("follow.followingBackProgress", { defaultValue: "Following back {{completed}} of {{total}}", completed, total })
              : finding
                ? t("follow.findingFollowers", "Finding followers...")
                : t("follow.followBackAll", "Follow back all")}
          </Text>
        </AccentButtonGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default FollowBackAllSheet;

const s = StyleSheet.create({
  body: { alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 12 },
  tile: {
    width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", textAlign: "center", marginTop: 4 },
  copy: { color: "#A1A1AA", fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 300 },
  track: { alignSelf: "stretch", height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.8)" },
  actions: { alignSelf: "stretch", gap: 6, marginTop: 4 },
  ghost: { height: 46, alignItems: "center", justifyContent: "center" },
  ghostText: { color: "#FFFFFF", fontSize: 15, fontWeight: "500" },
  barTouch: { borderRadius: 12, overflow: "hidden" },
  barBusy: { opacity: 0.7 },
  bar: {
    height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.30)",
  },
  barLabel: { fontSize: 15, fontWeight: "600" },
});
