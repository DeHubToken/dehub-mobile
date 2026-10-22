/**
 * Two creator widgets on a phone: the streamer's level and weekly streak, and a
 * gift jar that fills with paid gifts. The twin of dehubweb's level-and-jar.tsx.
 */
import React, { useContext, useEffect, useRef, useState } from "react";
import { Text, View, type ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { getStreamerProgress } from "../../services/live.service";
import { setting } from "../../libs/live-overlay/registry";
import type { OverlayStats } from "../../libs/live-overlay/types";
import { OverlayCreatorContext } from "./subathon";
import { useOverlayEvent, type LiveRoomEvent } from "./overlayEvents";

const HEX = /^#[0-9a-f]{6}$/i;
const tintOf = (settings: Record<string, unknown>, fallback = "#ffffff") => {
  const c = setting(settings, "accent", fallback);
  return HEX.test(c) ? c : fallback;
};
const GLASS: ViewStyle = { backgroundColor: "rgba(10,10,12,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" };

export function StreamerLevel({ settings, box }: { settings: Record<string, unknown>; box: { width: number; height: number } }) {
  const { t } = useTranslation();
  const creator = useContext(OverlayCreatorContext);
  const showStreak = setting(settings, "showStreak", true);
  const { data } = useQuery({
    queryKey: ["streamer-progress", creator],
    queryFn: () => getStreamerProgress(creator),
    enabled: !!creator,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
  if (!data) return null;
  const progress = Math.min(1, Math.max(0, Number((data as any).progressToNext) || 0));
  const h = box.height;
  const streak = Number((data as any).currentStreakWeeks) || 0;
  return (
    <View style={[GLASS, { flex: 1, justifyContent: "center", paddingHorizontal: h * 0.2, borderRadius: h * 0.22 }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "700", fontSize: h * 0.22 }}>
          {t("liveOverlay.level", { level: (data as any).level })}
        </Text>
        {showStreak && streak ? (
          <Text numberOfLines={1} style={{ color: "rgba(255,255,255,0.85)", fontWeight: "600", fontSize: h * 0.22 }}>
            {t("liveOverlay.streak", { count: streak })}
          </Text>
        ) : null}
      </View>
      <View style={{ marginTop: h * 0.1, height: h * 0.2, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.14)", overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${Math.round(progress * 100)}%` as `${number}%`, borderRadius: 999, backgroundColor: tintOf(settings) }} />
      </View>
    </View>
  );
}

const DROP_MS = 1200;

export function TipJar({ settings, stats, box }: { settings: Record<string, unknown>; stats: OverlayStats; box: { width: number; height: number } }) {
  const { t } = useTranslation();
  const target = Math.max(1, setting(settings, "target", 100_000));
  const title = setting(settings, "title", "") || t("liveOverlay.tipJar");
  const base = stats.totalTips;
  const [delta, setDelta] = useState(0);
  const [drops, setDrops] = useState<number[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => setDelta(0), [base]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useOverlayEvent((event: LiveRoomEvent) => {
    if (event.type !== "tipConfirmed") return;
    setDelta((d) => d + event.paidAmount);
    const id = Date.now() + Math.random();
    setDrops((list) => [...list.slice(-4), id]);
    timers.current.push(setTimeout(() => setDrops((list) => list.filter((x) => x !== id)), DROP_MS));
  });
  const value = base + delta;
  const fill = Math.min(1, value / target);
  const w = box.width;
  const color = tintOf(settings, "#facc15");
  return (
    <View style={{ flex: 1, alignItems: "center", gap: w * 0.04 }}>
      <View
        style={{
          flex: 1,
          width: "70%",
          overflow: "hidden",
          borderTopLeftRadius: w * 0.08,
          borderTopRightRadius: w * 0.08,
          borderBottomLeftRadius: w * 0.2,
          borderBottomRightRadius: w * 0.2,
          borderWidth: Math.max(1, w * 0.025),
          borderColor: "rgba(255,255,255,0.75)",
          backgroundColor: "rgba(255,255,255,0.08)",
          justifyContent: "flex-end",
        }}
      >
        <View style={{ height: `${Math.round(fill * 100)}%` as `${number}%`, backgroundColor: color, opacity: 0.85 }} />
        {drops.map((id, i) => (
          <Animated.Text
            key={id}
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(300)}
            style={{ position: "absolute", top: "20%", left: `${20 + ((i * 23) % 60)}%` as `${number}%`, fontSize: w * 0.16 }}
          >
            🪙
          </Animated.Text>
        ))}
      </View>
      <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "700", fontSize: w * 0.09 }}>
        {title}
      </Text>
      <Text numberOfLines={1} style={{ color: "rgba(255,255,255,0.85)", fontWeight: "600", fontSize: w * 0.08 }}>
        {`${Math.floor(value).toLocaleString()} / ${target.toLocaleString()} DHB`}
      </Text>
    </View>
  );
}
