/**
 * The subathon timer and the points board on a phone — two widgets that read
 * state the stream API keeps. The twin of dehubweb's overlay/subathon.tsx.
 */
import React, { createContext, useContext, useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Eyebrow, Glass, ListRow, Medal, withAlpha } from "./premium";
import { useQuery } from "@tanstack/react-query";
import { useWebSocket } from "../../context/WebSocketContext";
import { getPointsBoard } from "../../services/live.service";
import { setting } from "../../libs/live-overlay/registry";
import type { OverlaySubathon } from "../../libs/live-overlay/types";

export interface SubathonState {
  running: boolean;
  endsAt: string | null;
  lastAdd: { seconds: number; at: number } | null;
}

export const SubathonContext = createContext<SubathonState>({ running: false, endsAt: null, lastAdd: null });

/** Whose overlay this is, for widgets that read the creator's own data. */
export const OverlayCreatorContext = createContext<string>("");

export interface SubathonUpdate {
  running: boolean;
  endsAt: string | null;
  addedSec?: number;
}

export function parseSubathonUpdate(data: any): SubathonUpdate {
  return {
    running: !!data?.running && typeof data?.endsAt === "string",
    endsAt: typeof data?.endsAt === "string" ? data.endsAt : null,
    addedSec: Number.isFinite(Number(data?.addedSec)) ? Number(data.addedSec) : undefined,
  };
}

export function applySubathon(update: SubathonUpdate) {
  return (prev: SubathonState): SubathonState => ({
    running: update.running,
    endsAt: update.endsAt,
    lastAdd: update.addedSec && update.addedSec > 0 ? { seconds: update.addedSec, at: Date.now() } : prev.lastAdd,
  });
}

/** The stream's subathon, starting from what the overlay said and kept current from its room. */
export function useStreamSubathon(streamId: string | null | undefined, initial: OverlaySubathon | null | undefined): SubathonState {
  const { on } = useWebSocket();
  const [state, setState] = useState<SubathonState>(() => ({ running: !!initial, endsAt: initial?.endsAt ?? null, lastAdd: null }));
  const initialEnd = initial?.endsAt ?? null;
  useEffect(() => {
    setState((prev) => (prev.endsAt === initialEnd ? prev : { running: !!initialEnd, endsAt: initialEnd, lastAdd: null }));
  }, [initialEnd]);
  useEffect(() => {
    if (!streamId) return;
    const off = on("stream.subathon", (data: any) => {
      if (String(data?.streamId ?? "") !== String(streamId)) return;
      setState(applySubathon(parseSubathonUpdate(data)));
    });
    return () => {
      if (typeof off === "function") off();
    };
  }, [on, streamId]);
  return state;
}

export function clockOf(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const HEX = /^#[0-9a-f]{6}$/i;
const FLASH_MS = 2500;

export function SubathonTimer({ settings, box }: { settings: Record<string, unknown>; box: { width: number; height: number } }) {
  const { t } = useTranslation();
  const { running, endsAt, lastAdd } = useContext(SubathonContext);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  if (!running || !endsAt) return null;

  const left = Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000));
  const label = setting(settings, "label", "") || t("liveOverlay.subathon");
  const tint = setting(settings, "accent", "#ffffff");
  const flash = lastAdd && now - lastAdd.at < FLASH_MS ? lastAdd.seconds : 0;
  const h = box.height;
  return (
    <Glass radius={h * 0.26} shadow={false} style={{ flex: 1, justifyContent: "center", paddingHorizontal: h * 0.24 }}>
      <Eyebrow size={h * 0.15}>{label}</Eyebrow>
      <Text
        style={{
          color: HEX.test(tint) ? tint : "#ffffff",
          fontWeight: "800",
          fontSize: left === 0 ? h * 0.3 : h * 0.46,
          fontVariant: ["tabular-nums"],
          textShadowColor: withAlpha(HEX.test(tint) ? tint : "#ffffff", 0.35),
          textShadowRadius: h * 0.18,
        }}
      >
        {left === 0 ? t("liveOverlay.subathonOver") : clockOf(left)}
      </Text>
      {flash ? (
        <Animated.Text
          key={lastAdd!.at}
          entering={FadeInDown.duration(250)}
          exiting={FadeOutUp.duration(400)}
          style={{ position: "absolute", right: h * 0.2, top: h * 0.25, color: "#4ade80", fontWeight: "800", fontSize: h * 0.3 }}
        >
          {`+${clockOf(flash).replace(/^0:/, "")}`}
        </Animated.Text>
      ) : null}
    </Glass>
  );
}

export function PointsBoard({ settings, box }: { settings: Record<string, unknown>; box: { width: number; height: number } }) {
  const { t } = useTranslation();
  const creator = useContext(OverlayCreatorContext);
  const count = Math.min(10, Math.max(1, setting(settings, "count", 5)));
  const title = setting(settings, "title", "") || t("liveOverlay.pointsTitle");
  const { data } = useQuery({
    queryKey: ["points-board", creator, count],
    queryFn: () => getPointsBoard(creator, count),
    enabled: !!creator,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const rows = data ?? [];
  if (!rows.length) return null;
  const row = box.height / (count + 1);
  return (
    <Glass radius={row * 0.42} shadow={false} style={{ flex: 1, paddingVertical: row * 0.32, paddingHorizontal: row * 0.45 }}>
      <Eyebrow size={row * 0.3} style={{ marginBottom: row * 0.12 }}>
        {title}
      </Eyebrow>
      {rows.map((r, i) => (
        <ListRow key={r.address} row={row} first={i === 0}>
          <Medal place={i + 1} size={row * 0.42} />
          <Text numberOfLines={1} style={{ flex: 1, color: "#fff", fontWeight: "600", fontSize: row * 0.4 }}>
            {r.displayName || r.username || `${r.address.slice(0, 6)}…`}
          </Text>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: row * 0.4, fontVariant: ["tabular-nums"] }}>
            {t("liveOverlay.points", { count: r.points, formatted: r.points.toLocaleString() })}
          </Text>
        </ListRow>
      ))}
    </Glass>
  );
}
