/**
 * Skippable sections: mark a sponsor read or intro, and vote on the marks
 * other viewers left. Port of web's SegmentMarkerDrawer.
 *
 * The video keeps playing underneath: tap Start when the read begins and End
 * when it stops. The times come from the player through libs/video-clock.
 */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { useThemeRootStyle } from "../../context/ThemeContext";
import { useAuthActions, useAuthState, useUser } from "../../context/AuthContext";
import { useSegmentActions, useVideoSegments } from "../../hooks/useVideoSegments";
import { SEGMENT_CATEGORIES, SEGMENT_LABELS, type SegmentCategory } from "../../services/video-segments.service";
import { readVideoClock } from "../../libs/video-clock";

function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  tokenId: string | number;
}

export default function SegmentMarkerSheet({ visible, onClose, tokenId }: Props) {
  const { t } = useTranslation();
  const rootStyle = useThemeRootStyle();
  const user = useUser() as any;
  const { isSignedIn } = useAuthState();
  const { requireAuth } = useAuthActions();
  const wallet = ((user?.walletAddress || user?.address || "") as string).toLowerCase();
  // Always fetched while open, whatever the skip setting: here the marks are the point.
  const { segments, isLoading } = useVideoSegments(tokenId, visible);
  const { submit, vote, remove } = useSegmentActions(tokenId);

  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [category, setCategory] = useState<SegmentCategory>("sponsor");

  useEffect(() => {
    if (!visible) {
      setStart(null);
      setEnd(null);
      setCategory("sponsor");
    }
  }, [visible]);

  const canSubmit = start !== null && end !== null && end > start && !submit.isPending;

  const handleSubmit = () => {
    requireAuth(() => {
      if (start === null || end === null) return;
      submit.mutate(
        { category, startSeconds: start, endSeconds: end },
        { onSuccess: () => { setStart(null); setEnd(null); } },
      );
    });
  };

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" maxHeight="80%" blurIntensity={50}>
      <View style={[{ paddingHorizontal: 16, paddingBottom: 24 }, rootStyle]}>
        <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 6 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" }} />
        </View>
        <Text className="text-white text-lg font-semibold" style={{ marginBottom: 4 }}>
          {t("copy.30f4d96b8d72", { defaultValue: "Skippable sections" })}
        </Text>
        <Text className="text-theme-neutrals-500 text-xs" style={{ marginBottom: 12 }}>
          {t("copy.b5f85f952b0b", {
            defaultValue:
              "Mark a sponsor read or intro and everyone with skipping on jumps past it. Let the video run — tap Start when it begins and End when it stops.",
          })}
        </Text>

        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)", padding: 12, gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => {
                const now = readVideoClock(tokenId);
                setStart(now);
                if (end !== null && end <= now) setEnd(null);
              }}
              style={{ flex: 1, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(63,63,70,0.9)" }}
              accessibilityRole="button"
            >
              <Text className="text-white text-sm font-medium">
                {start === null
                  ? t("copy.e4bb9f1ece9a", { defaultValue: "Start" })
                  : t("copy.5e2495b60820", { defaultValue: "Start {{value1}}", value1: clock(start) })}
              </Text>
            </Pressable>
            <Pressable
              disabled={start === null}
              onPress={() => setEnd(readVideoClock(tokenId))}
              style={{ flex: 1, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(63,63,70,0.9)", opacity: start === null ? 0.4 : 1 }}
              accessibilityRole="button"
            >
              <Text className="text-white text-sm font-medium">
                {end === null
                  ? t("copy.f4db1e48476f", { defaultValue: "End" })
                  : t("copy.78de1ed22dcb", { defaultValue: "End {{value1}}", value1: clock(end) })}
              </Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {SEGMENT_CATEGORIES.map((value) => {
              const active = category === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setCategory(value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={{
                    paddingHorizontal: 10,
                    height: 28,
                    justifyContent: "center",
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: active ? "rgba(255,255,255,0.5)" : "transparent",
                    backgroundColor: active ? "rgba(99,102,241,0.35)" : "rgba(63,63,70,0.9)",
                  }}
                >
                  <Text style={{ color: active ? "#FFFFFF" : "#D4D4D8", fontSize: 12, fontWeight: "600" }}>
                    {t(`player.segmentLabel.${value}`, { defaultValue: SEGMENT_LABELS[value] })}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            disabled={!canSubmit}
            onPress={handleSubmit}
            style={{ height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.1)", opacity: canSubmit ? 1 : 0.4 }}
            accessibilityRole="button"
          >
            {submit.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white text-sm font-semibold">
                {start !== null && end !== null
                  ? t("copy.5218ce9ed7ab", { defaultValue: "Submit {{value1}} – {{value2}}", value1: clock(start), value2: clock(end) })
                  : t("copy.155f816c0407", { defaultValue: "Submit" })}
              </Text>
            )}
          </Pressable>
        </View>

        <ScrollView style={{ marginTop: 14, maxHeight: 260 }} contentContainerStyle={{ gap: 8 }}>
          {isLoading ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <ActivityIndicator size="small" color="#A1A1AA" />
            </View>
          ) : segments.length === 0 ? (
            <View style={{ paddingVertical: 18, alignItems: "center", gap: 8 }}>
              <Icon name="Video" size={22} color="#71717A" />
              <Text className="text-theme-neutrals-500 text-sm">
                {t("copy.e5f6facf9cbe", { defaultValue: "Nothing marked on this video yet" })}
              </Text>
            </View>
          ) : (
            segments.map((segment) => {
              const mine = !!wallet && segment.address?.toLowerCase() === wallet;
              return (
                <View
                  key={segment.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text className="text-white text-sm" numberOfLines={1}>
                      {t(`player.segmentLabel.${segment.category}`, { defaultValue: SEGMENT_LABELS[segment.category as SegmentCategory] ?? segment.category })}
                      <Text className="text-theme-neutrals-500"> · {clock(segment.start_seconds)} – {clock(segment.end_seconds)}</Text>
                    </Text>
                    <Text className="text-theme-neutrals-500" style={{ fontSize: 11, marginTop: 2 }}>
                      {segment.votes_up}
                      {t("copy.72915d37182e", { defaultValue: " agree" })}
                      {segment.votes_down > 0 ? t("copy.2f41333ad013", { defaultValue: " · {{value1}} disagree", value1: segment.votes_down }) : ""}
                    </Text>
                  </View>
                  {mine ? (
                    <Pressable
                      onPress={() => remove.mutate(segment.id)}
                      hitSlop={6}
                      style={{ padding: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={t("copy.77f3aefe8b8b", { defaultValue: "Remove your mark" })}
                    >
                      {remove.isPending ? <ActivityIndicator size="small" color="#A1A1AA" /> : <Icon name="Trash2" size={16} color="#A1A1AA" />}
                    </Pressable>
                  ) : (
                    <>
                      <Pressable
                        onPress={() => requireAuth(() => vote.mutate({ segmentId: segment.id, value: 1 }))}
                        hitSlop={6}
                        style={{ padding: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={t("copy.dc469bffc7c0", { defaultValue: "This section is right" })}
                      >
                        <Icon name="ThumbsUp" size={16} color="#A1A1AA" />
                      </Pressable>
                      <Pressable
                        onPress={() => requireAuth(() => vote.mutate({ segmentId: segment.id, value: -1 }))}
                        hitSlop={6}
                        style={{ padding: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={t("copy.58db9997b230", { defaultValue: "This section is wrong" })}
                      >
                        <Icon name="ThumbsDown" size={16} color="#A1A1AA" />
                      </Pressable>
                    </>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>

        {!isSignedIn && (
          <Text className="text-theme-neutrals-500 text-xs text-center" style={{ marginTop: 10 }}>
            {t("copy.3c42f559d757", { defaultValue: "Sign in to mark or vote. Skipping works either way." })}
          </Text>
        )}

        <Pressable onPress={onClose} style={{ marginTop: 10, height: 38, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }} accessibilityRole="button">
          <Icon name="Check" size={16} color="#A1A1AA" />
          <Text className="text-theme-neutrals-400 text-sm">{t("common.done", { defaultValue: "Done" })}</Text>
        </Pressable>
      </View>
    </GlassModal>
  );
}
