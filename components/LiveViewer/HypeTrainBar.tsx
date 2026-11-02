/**
 * The hype train bar across the top of a live, the app side of web's
 * HypeTrainBar. Gifts and subscriptions are counted on the stream API, so the
 * app shows the same level and countdown as web and OBS. A train that ended
 * stays up a few seconds to show the level the room reached, then goes.
 */
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { getHypeTrain, parseHypeTrain, type HypeTrain } from "../../services/live-hype.service";
import { LivestreamEvents } from "../../services/enums/livestream.enum";

const ENDED_HOLD_MS = 8000;

type SocketOn = (event: any, handler: (data: any) => void) => (() => void) | void;

/** The stream's hype train: fetched on open, then kept by the room's `stream.hype` events. */
export function useStreamHype(streamId: string | null | undefined, socketOn: SocketOn): HypeTrain | null {
  const [train, setTrain] = useState<HypeTrain | null>(null);
  useEffect(() => {
    setTrain(null);
    if (!streamId) return;
    let cancelled = false;
    getHypeTrain(streamId)
      .then((t) => {
        if (!cancelled && t && t.active) setTrain((prev) => prev ?? t);
      })
      .catch(() => undefined);
    const off = socketOn(LivestreamEvents.HypeUpdate, (data: any) => {
      if (String(data?.streamId ?? "") !== String(streamId)) return;
      const t = parseHypeTrain(data);
      if (t) setTrain(t);
    });
    return () => {
      cancelled = true;
      try { off?.(); } catch {}
    };
  }, [streamId, socketOn]);

  // Off screen once it ended and has been shown, or ran out without an end event.
  useEffect(() => {
    if (!train) return;
    const until = train.ended ? Date.now() + ENDED_HOLD_MS : new Date(train.expiresAt).getTime() + ENDED_HOLD_MS;
    const id = setTimeout(() => setTrain((t) => (t === train ? null : t)), Math.max(0, until - Date.now()));
    return () => clearTimeout(id);
  }, [train]);

  return train;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function HypeTrainBody({ train }: { train: HypeTrain }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (train.ended) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [train.ended]);
  const left = train.ended ? 0 : Math.max(0, Math.ceil((new Date(train.expiresAt).getTime() - now) / 1000));
  const title = train.ended
    ? train.completed > 0
      ? t("liveHype.train.endedLevel", { level: train.completed, defaultValue: "Hype Train finished level {{level}}!" })
      : t("liveHype.train.ended", { defaultValue: "Hype Train ended" })
    : t("liveHype.train.level", { level: train.level, defaultValue: "Hype Train · Level {{level}}" });
  const detail = train.ended
    ? t("liveHype.train.thanks", { count: train.contributors, defaultValue: "Thanks to {{count}} supporters" })
    : mmss(left);
  const progress = train.ended ? 1 : Math.min(1, train.into / Math.max(1, train.need));
  const top = train.top[0];
  const topName = top ? top.displayName || top.username || (top.address ? `${top.address.slice(0, 6)}…` : "") : "";

  return (
    <View accessibilityRole="text" accessibilityLiveRegion="polite" className="dark-surface" style={styles.bar}>
      <View style={styles.head}>
        <Text numberOfLines={1} style={styles.title}>🚂 {title}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <View style={styles.track}>
        <LinearGradient colors={["#f97316", "#fde047"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      {topName && !train.ended ? (
        <Text numberOfLines={1} style={styles.top}>{t("liveHype.train.top", { name: topName, defaultValue: "Top: {{name}}" })}</Text>
      ) : null}
    </View>
  );
}

export default function HypeTrainBar({ streamId, socketOn, style }: { streamId: string | null | undefined; socketOn: SocketOn; style?: object }) {
  const train = useStreamHype(streamId, socketOn);
  if (!train) return null;
  return <View pointerEvents="none" style={style}><HypeTrainBody train={train} /></View>;
}

const styles = StyleSheet.create({
  bar: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(251,146,60,0.4)", backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 12, paddingVertical: 8 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  title: { color: "#fff", fontSize: 12, fontWeight: "600", flexShrink: 1 },
  detail: { color: "#fed7aa", fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] },
  track: { marginTop: 6, height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.15)" },
  fill: { height: "100%", borderRadius: 3 },
  top: { marginTop: 4, color: "#d4d4d8", fontSize: 11 },
});
