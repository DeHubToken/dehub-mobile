/**
 * The widgets a creator can place on their stream. The twin of dehubweb
 * src/components/app/live/overlay/overlay-widgets.tsx — same kinds, same
 * settings, same behaviour — drawn over the viewer's own player.
 *
 * Every size is a share of the widget's own box (`box.height`), so a widget
 * placed small on a phone stream and large on a desktop one keeps its
 * proportions. Nothing a creator typed is rendered as anything but text.
 */
import React, { memo, useContext, useEffect, useRef, useState } from "react";
import { Text, View, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, ThumbsUp } from "../ui/cut-icons";
import Avatar from "../common/Avatar";
import { DhbCoin } from "../common/DhbCoin";
import TipAnimationsOverlay from "../LiveProducer/TipAnimationsOverlay";
import { useTipAnimations } from "../../hooks/useTipAnimations";
import { useLiveAudience } from "../../hooks/useLiveAudience";
import type { LiveAudience } from "../../services/live.service";
import { tierFromGift } from "../../config/gift-tiers";
import { getAvatarUrl } from "../../libs/misc";
import { setting, type OverlayKind } from "../../libs/live-overlay/registry";
import type { OverlayStats } from "../../libs/live-overlay/types";
import {
  OverlayChatContext,
  useOverlayEvent,
  type LiveRoomEvent,
  type OverlayChatLine,
  type RoomUser,
} from "./overlayEvents";
import { useAlertQueue } from "./useAlertQueue";
import { useRuleFired } from "./ruleBus";
import { PollWidget } from "./poll";

export interface WidgetProps {
  settings: Record<string, unknown>;
  streamId: string;
  stats: OverlayStats;
  initialViewers: number;
  /** The widget's box in pixels. */
  box: { width: number; height: number };
}

const HEX = /^#[0-9a-f]{6}$/i;
function accent(settings: Record<string, unknown>): string {
  const c = setting(settings, "accent", "#ffffff");
  return HEX.test(c) ? c : "#ffffff";
}

const GLASS: ViewStyle = {
  backgroundColor: "rgba(10,10,12,0.72)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.16)",
};

function useName(user: RoomUser | undefined): string {
  const { t } = useTranslation();
  return user?.displayName || user?.username || t("liveOverlay.someone");
}

// ─── Tip alert ────────────────────────────────────────────────────────────────

interface TipItem {
  amount: number;
  selectedTier?: string;
  user: RoomUser;
  message?: string;
}

const CONFIRM_WAIT_MS = 120_000;

function TipAlert({ settings, box }: WidgetProps) {
  const { t } = useTranslation();
  const style = setting(settings, "style", "celebration");
  const minAmount = setting(settings, "minAmount", 0);
  const showMessage = setting(settings, "showMessage", true);
  const confirmedOnly = setting(settings, "confirmedOnly", false);

  const { items: celebrations, enqueueFromGift } = useTipAnimations({ maxConcurrent: 2 });
  const banner = useAlertQueue<TipItem>((item) => tierFromGift(item).durationMs);
  const held = useRef(new Map<string, { item: TipItem; at: number }>());

  const play = (item: TipItem) => {
    if (item.amount < minAmount) return;
    const shown = showMessage ? item : { ...item, message: undefined };
    if (style === "banner") banner.push(shown);
    else
      enqueueFromGift({
        amount: shown.amount,
        selectedTier: shown.selectedTier,
        username: shown.user.displayName || shown.user.username,
        message: shown.message,
      });
  };

  useOverlayEvent((event: LiveRoomEvent) => {
    if (event.type === "tip") {
      const item = { amount: event.amount, selectedTier: event.selectedTier, user: event.user, message: event.message };
      if (!confirmedOnly) return play(item);
      if (!event.transactionHash) return;
      const now = Date.now();
      for (const [hash, entry] of held.current) if (now - entry.at > CONFIRM_WAIT_MS) held.current.delete(hash);
      held.current.set(event.transactionHash, { item, at: now });
    } else if (event.type === "tipConfirmed" && confirmedOnly) {
      const entry = held.current.get(event.transactionHash);
      if (!entry) return;
      held.current.delete(event.transactionHash);
      // The paid amount, not the claim, and the tier that amount actually buys.
      play({ ...entry.item, amount: event.paidAmount, selectedTier: undefined });
    }
  });

  if (style !== "banner") return <TipAnimationsOverlay items={celebrations} />;
  const current = banner.current;
  if (!current || current.leaving) return null;
  const tier = tierFromGift(current.item);
  return (
    <Banner key={current.id} box={box}>
      <Text style={{ fontSize: box.height * 0.42 }}>{tier.emoji}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <NameLine box={box} user={current.item.user} />
        <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: box.height * 0.18 }} numberOfLines={1}>
          {t(`liveGift.tier.${tier.key}`, tier.name)} · {current.item.amount.toLocaleString()}{" "}
          <DhbCoin size={Math.max(10, box.height * 0.18)} />
        </Text>
        {current.item.message ? (
          <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: box.height * 0.17 }} numberOfLines={2}>
            {current.item.message}
          </Text>
        ) : null}
      </View>
    </Banner>
  );
}

function NameLine({ box, user }: { box: WidgetProps["box"]; user: RoomUser }) {
  const name = useName(user);
  return (
    <Text style={{ color: "#fff", fontWeight: "700", fontSize: box.height * 0.24 }} numberOfLines={1}>
      {name}
    </Text>
  );
}

function Banner({ box, children }: { box: WidgetProps["box"]; children: React.ReactNode }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(380)}
      exiting={FadeOutUp.duration(320)}
      style={[
        GLASS,
        {
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: box.height * 0.12,
          paddingHorizontal: box.height * 0.18,
          borderRadius: box.height * 0.22,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// ─── Follow, subscribe, share, join ───────────────────────────────────────────

interface PersonItem {
  user: RoomUser;
  planName?: string;
}

const PERSON_EVENT: Partial<Record<OverlayKind, LiveRoomEvent["type"]>> = {
  follow_alert: "follow",
  subscribe_alert: "subscribe",
  share_alert: "share",
  join_alert: "join",
};

function PersonAlert({ settings, kind, box }: WidgetProps & { kind: OverlayKind }) {
  const { t } = useTranslation();
  const durationMs = setting(settings, "durationMs", 5000);
  const queue = useAlertQueue<PersonItem>(() => durationMs);
  // The gateway re-sends a viewer's join on every reconnect. Each person
  // arrives once.
  const seen = useRef(new Set<string>());
  const wanted = PERSON_EVENT[kind];

  useOverlayEvent((event: LiveRoomEvent) => {
    if (event.type !== wanted || !("user" in event) || !event.user) return;
    if (event.type === "join") {
      const key = event.user.address;
      if (!key || seen.current.has(key)) return;
      seen.current.add(key);
    }
    queue.push({ user: event.user, planName: event.type === "subscribe" ? event.planName : undefined });
  });

  const name = useName(queue.current?.item.user);
  const current = queue.current;
  if (!current || current.leaving) return null;
  const line =
    kind === "follow_alert"
      ? t("liveOverlay.newFollower", { name })
      : kind === "subscribe_alert"
        ? current.item.planName
          ? t("liveOverlay.subscribedTo", { name, plan: current.item.planName })
          : t("liveOverlay.newSubscriber", { name })
        : kind === "share_alert"
          ? t("liveOverlay.shared", { name })
          : t("liveOverlay.joined", { name });
  const avatar = getAvatarUrl(current.item.user.avatarImageUrl) || undefined;

  return (
    <Banner key={current.id} box={box}>
      <Avatar uri={avatar} size={Math.max(16, box.height * 0.6)} name={name} />
      <Text style={{ flex: 1, color: "#fff", fontWeight: "700", fontSize: box.height * 0.26 }} numberOfLines={1}>
        {line}
      </Text>
    </Banner>
  );
}

// ─── Goal bar ─────────────────────────────────────────────────────────────────

function GoalBar({ settings, stats, box }: WidgetProps) {
  const { t } = useTranslation();
  const metric = setting(settings, "metric", "tips") === "followers" ? "followers" : "tips";
  const target = Math.max(1, setting(settings, "target", metric === "tips" ? 1_000_000 : 1000));
  const title = setting(settings, "title", "");
  const base = metric === "tips" ? stats.totalTips : stats.followers;
  const color = accent(settings);

  // Counted on top of the server's figure until the server's figure moves.
  const [delta, setDelta] = useState(0);
  useEffect(() => setDelta(0), [base]);

  useOverlayEvent((event: LiveRoomEvent) => {
    if (metric === "tips" && event.type === "tipConfirmed") setDelta((d) => d + event.paidAmount);
    if (metric === "followers" && event.type === "follow") setDelta((d) => d + 1);
  });

  const value = base + delta;
  const reached = value >= target;
  const progress = Math.min(1, value / target);
  const font = box.height * 0.22;

  return (
    <View
      style={[
        GLASS,
        { flex: 1, justifyContent: "center", paddingHorizontal: box.height * 0.2, borderRadius: box.height * 0.22 },
      ]}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: font, flexShrink: 1 }} numberOfLines={1}>
          {reached ? t("liveOverlay.goalReached") : title}
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "600", fontSize: font }} numberOfLines={1}>
          {Math.floor(value).toLocaleString()} / {target.toLocaleString()}{" "}
          {metric === "tips" ? <DhbCoin size={Math.max(10, font)} /> : t("liveOverlay.followersUnit")}
        </Text>
      </View>
      <View
        style={{
          marginTop: box.height * 0.1,
          height: box.height * 0.2,
          borderRadius: 999,
          backgroundColor: "rgba(255,255,255,0.14)",
          overflow: "hidden",
        }}
      >
        <View style={{ height: "100%", width: `${progress * 100}%`, borderRadius: 999, backgroundColor: color }} />
      </View>
    </View>
  );
}

// ─── Top supporters ───────────────────────────────────────────────────────────

const PREVIEW_SUPPORTERS: LiveAudience["topTippers"] = [
  500_000, 250_000, 100_000, 50_000, 25_000, 10_000, 5_000, 2_500, 1_000, 500,
].map((total, i) => ({ address: `preview-${i}`, displayName: "—", total, count: 1 }));

function TopSupporters({ settings, streamId, box }: WidgetProps) {
  const { t } = useTranslation();
  const count = Math.min(10, Math.max(1, setting(settings, "count", 3)));
  const title = setting(settings, "title", "") || t("liveOverlay.topSupporters");
  const queryClient = useQueryClient();
  const { data } = useLiveAudience(streamId);
  const row = box.height / (count + 1);

  // Confirmed tips only, debounced so a burst of gifts is one refetch.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);
  useOverlayEvent((event: LiveRoomEvent) => {
    if (event.type !== "tipConfirmed" || pending.current) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      void queryClient.invalidateQueries({ queryKey: ["live-audience", streamId] });
    }, 1500);
  });

  // With no stream behind it (Live Studio's preview) the board shows the shape
  // it will have, so a creator can size it before anyone has tipped.
  const rows = (streamId ? data?.topTippers ?? [] : PREVIEW_SUPPORTERS).slice(0, count);
  return (
    <View style={[GLASS, { flex: 1, paddingHorizontal: row * 0.45, paddingVertical: row * 0.3, borderRadius: row * 0.4 }]}>
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: row * 0.42, marginBottom: row * 0.15 }} numberOfLines={1}>
        {title}
      </Text>
      {rows.map((r, i) => (
        <View key={r.address} style={{ height: row, flexDirection: "row", alignItems: "center", gap: row * 0.3 }}>
          <Text style={{ width: row * 0.6, textAlign: "center", color: "rgba(255,255,255,0.7)", fontWeight: "700", fontSize: row * 0.4 }}>
            {i + 1}
          </Text>
          <Text style={{ flex: 1, color: "#fff", fontSize: row * 0.4 }} numberOfLines={1}>
            {r.displayName || r.username || t("liveOverlay.someone")}
          </Text>
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: row * 0.4 }}>
            {Math.floor(r.total).toLocaleString()} <DhbCoin size={Math.max(10, row * 0.4)} />
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Viewer count ─────────────────────────────────────────────────────────────

function ViewerCount({ initialViewers, box }: WidgetProps) {
  const [count, setCount] = useState(initialViewers);
  useOverlayEvent((event: LiveRoomEvent) => {
    if (event.type === "viewers") setCount(event.count);
  });
  const font = box.height * 0.42;
  return (
    <View
      style={[
        GLASS,
        {
          alignSelf: "flex-start",
          height: "100%",
          flexDirection: "row",
          alignItems: "center",
          gap: font * 0.35,
          paddingHorizontal: box.height * 0.25,
          borderRadius: 999,
        },
      ]}
    >
      <Eye color="#fff" size={font} />
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: font }}>{count.toLocaleString()}</Text>
    </View>
  );
}

// ─── Text and lower third ─────────────────────────────────────────────────────

function TextWidget({ settings, box }: WidgetProps) {
  const lowerThird = setting(settings, "style", "plain") === "lower_third";
  const text = setting(settings, "text", "");
  const subtext = setting(settings, "subtext", "");
  if (!text && !subtext) return null;
  const color = accent(settings);
  return (
    <View
      style={[
        { flex: 1, justifyContent: "center" },
        lowerThird && {
          paddingHorizontal: box.height * 0.25,
          borderLeftWidth: box.height * 0.07,
          borderLeftColor: color,
          backgroundColor: "rgba(10,10,12,0.72)",
        },
      ]}
    >
      {text ? (
        <Text
          style={{
            color: "#fff",
            fontWeight: "800",
            fontSize: box.height * (lowerThird ? 0.32 : 0.5),
            textShadowColor: lowerThird ? "transparent" : "rgba(0,0,0,0.6)",
            textShadowRadius: lowerThird ? 0 : 8,
          }}
          numberOfLines={1}
        >
          {text}
        </Text>
      ) : null}
      {subtext ? (
        <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: box.height * 0.19 }} numberOfLines={1}>
          {subtext}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Frame ────────────────────────────────────────────────────────────────────

function Frame({ settings, box }: WidgetProps) {
  const glow = setting(settings, "style", "solid") === "glow";
  // Thickness and rounding are thousandths of the widget's height, as on web.
  const thickness = Math.min(80, Math.max(1, setting(settings, "thickness", 6)));
  const radius = Math.min(300, Math.max(0, setting(settings, "radius", 0)));
  const color = accent(settings);
  return (
    <View
      style={{
        flex: 1,
        borderWidth: Math.max(1, (box.height * thickness) / 1000),
        borderColor: color,
        borderRadius: (box.height * radius) / 1000,
        ...(glow ? { shadowColor: color, shadowOpacity: 0.9, shadowRadius: 12, elevation: 0 } : null),
      }}
    />
  );
}

// ─── Stream timer ─────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function Pill({ box, children }: { box: WidgetProps["box"]; children: React.ReactNode }) {
  const font = box.height * 0.42;
  return (
    <View
      style={[
        GLASS,
        {
          alignSelf: "flex-start",
          height: "100%",
          flexDirection: "row",
          alignItems: "center",
          gap: font * 0.35,
          paddingHorizontal: box.height * 0.25,
          borderRadius: 999,
        },
      ]}
    >
      {children}
    </View>
  );
}

function StreamTimer({ settings, stats, box }: WidgetProps) {
  const label = setting(settings, "label", "");
  // The stream's own start, so a refresh does not restart the clock. A
  // preview has none and counts from when it was drawn.
  const [drawnAt] = useState(() => Date.now());
  const startedAt = stats.startedAt ? Date.parse(stats.startedAt) : NaN;
  const from = Number.isFinite(startedAt) ? startedAt : drawnAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const font = box.height * 0.42;
  return (
    <Pill box={box}>
      <View style={{ width: font * 0.45, height: font * 0.45, borderRadius: 999, backgroundColor: accent(settings) }} />
      {label ? (
        <Text style={{ color: "rgba(255,255,255,0.8)", fontWeight: "600", fontSize: font }} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: font, fontVariant: ["tabular-nums"] }}>
        {formatElapsed(now - from)}
      </Text>
    </Pill>
  );
}

// ─── Reaction counter ─────────────────────────────────────────────────────────

function ReactionCounter({ settings, stats, box }: WidgetProps) {
  const base = Number(stats.reactions) || 0;
  // Counted on top of the server's figure until a fresh one replaces it.
  const [delta, setDelta] = useState(0);
  useEffect(() => setDelta(0), [base]);
  useOverlayEvent((event: LiveRoomEvent) => {
    if (event.type === "reaction") setDelta((d) => d + 1);
  });
  const font = box.height * 0.42;
  return (
    <Pill box={box}>
      <ThumbsUp color={accent(settings)} size={font} />
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: font, fontVariant: ["tabular-nums"] }}>
        {(base + delta).toLocaleString()}
      </Text>
    </Pill>
  );
}

// ─── Event feed ───────────────────────────────────────────────────────────────

interface FeedItem {
  id: number;
  kind: "tip" | "follow" | "subscribe" | "share";
  user: RoomUser;
  amount?: number;
  planName?: string;
}

function EventFeed({ settings, box }: WidgetProps) {
  const count = Math.min(8, Math.max(1, setting(settings, "count", 4)));
  const title = setting(settings, "title", "");
  const [items, setItems] = useState<FeedItem[]>([]);
  const seq = useRef(0);
  // Tips are listed once PAID. The paid event names its sender on a current
  // API; the claim that came first is the fallback for the name.
  const tippers = useRef(new Map<string, RoomUser>());

  useOverlayEvent((event: LiveRoomEvent) => {
    let item: Omit<FeedItem, "id"> | null = null;
    if (event.type === "tip" && event.transactionHash) {
      tippers.current.set(event.transactionHash, event.user);
      if (tippers.current.size > 50) tippers.current.delete(tippers.current.keys().next().value as string);
    } else if (event.type === "tipConfirmed") {
      const user = event.user ?? tippers.current.get(event.transactionHash) ?? { address: event.address };
      item = { kind: "tip", user, amount: event.paidAmount };
    } else if (event.type === "follow" || event.type === "share") {
      item = { kind: event.type, user: event.user };
    } else if (event.type === "subscribe") {
      item = { kind: "subscribe", user: event.user, planName: event.planName };
    }
    if (!item) return;
    seq.current += 1;
    const next = { ...item, id: seq.current };
    setItems((prev) => [next, ...prev].slice(0, count));
  });

  const row = box.height / (count + (title ? 1 : 0));
  return (
    <View style={[GLASS, { flex: 1, paddingHorizontal: row * 0.45, paddingVertical: row * 0.3, borderRadius: row * 0.4 }]}>
      {title ? (
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: row * 0.42, marginBottom: row * 0.15 }} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      {items.map((item) => (
        <FeedRow key={item.id} item={item} row={row} />
      ))}
    </View>
  );
}

function FeedRow({ item, row }: { item: FeedItem; row: number }) {
  const { t } = useTranslation();
  const name = useName(item.user);
  const line =
    item.kind === "tip"
      ? t("liveOverlay.tipped", { name })
      : item.kind === "follow"
        ? t("liveOverlay.newFollower", { name })
        : item.kind === "subscribe"
          ? item.planName
            ? t("liveOverlay.subscribedTo", { name, plan: item.planName })
            : t("liveOverlay.newSubscriber", { name })
          : t("liveOverlay.shared", { name });
  return (
    <Animated.View
      entering={FadeInDown.duration(260)}
      style={{ height: row, flexDirection: "row", alignItems: "center", gap: row * 0.3 }}
    >
      <Text style={{ flex: 1, color: "#fff", fontSize: row * 0.4 }} numberOfLines={1}>
        {line}
      </Text>
      {item.kind === "tip" ? (
        <Text style={{ color: "#fff", fontWeight: "600", fontSize: row * 0.4 }}>
          {Math.floor(item.amount ?? 0).toLocaleString()} <DhbCoin size={Math.max(10, row * 0.4)} />
        </Text>
      ) : null}
    </Animated.View>
  );
}

// ─── Chat box ─────────────────────────────────────────────────────────────────

function ChatBox({ settings, streamId, box }: WidgetProps) {
  const { t } = useTranslation();
  const count = Math.min(12, Math.max(1, setting(settings, "count", 6)));
  const showAvatars = setting(settings, "showAvatars", true);
  const lines = useContext(OverlayChatContext).slice(-count);
  const row = box.height / count;

  return (
    <View style={{ flex: 1, justifyContent: "flex-end", gap: row * 0.08 }}>
      {lines.length === 0 && !streamId ? (
        <View style={[chatLineStyle(row), { backgroundColor: "rgba(10,10,12,0.62)" }]}>
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: row * 0.4 }} numberOfLines={1}>
            {t("liveOverlay.chatPreview")}
          </Text>
        </View>
      ) : null}
      {lines.map((line) => (
        <ChatLine key={line.id} line={line} row={row} showAvatar={showAvatars} />
      ))}
    </View>
  );
}

function chatLineStyle(row: number): ViewStyle {
  return {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    gap: row * 0.25,
    minHeight: row * 0.9,
    paddingHorizontal: row * 0.3,
    borderRadius: row * 0.45,
    backgroundColor: "rgba(10,10,12,0.62)",
  };
}

function ChatLine({ line, row, showAvatar }: { line: OverlayChatLine; row: number; showAvatar: boolean }) {
  const name = useName(line.user);
  const avatar = getAvatarUrl(line.user.avatarImageUrl) || undefined;
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={chatLineStyle(row)}>
      {showAvatar ? <Avatar uri={avatar} size={Math.max(12, row * 0.6)} name={name} /> : null}
      <Text style={{ flexShrink: 1, color: "#fff", fontSize: row * 0.4 }} numberOfLines={1}>
        <Text style={{ fontWeight: "700", color: "rgba(255,255,255,0.75)" }}>{name} </Text>
        {line.text}
      </Text>
    </Animated.View>
  );
}

// ─── Ticker ───────────────────────────────────────────────────────────────────

const TICKER_SECONDS: Record<string, number> = { slow: 30, normal: 18, fast: 10 };

function Ticker({ settings, box }: WidgetProps) {
  const text = setting(settings, "text", "");
  const seconds = TICKER_SECONDS[setting(settings, "speed", "normal")] ?? TICKER_SECONDS.normal;
  const color = accent(settings);
  const [trackWidth, setTrackWidth] = useState(0);
  const x = useSharedValue(0);

  // Two copies side by side, moved by half the track: the second copy is
  // exactly where the first began when the loop restarts, so it never jumps.
  useEffect(() => {
    if (!trackWidth) return;
    x.value = 0;
    x.value = withRepeat(withTiming(-trackWidth / 2, { duration: seconds * 1000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(x);
  }, [trackWidth, seconds, x]);
  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  if (!text) return null;
  const font = box.height * 0.48;
  const copy = { color: "#fff", fontWeight: "700" as const, fontSize: font, paddingRight: font * 4, flexShrink: 0 };
  return (
    <View
      style={{
        flex: 1,
        overflow: "hidden",
        justifyContent: "center",
        backgroundColor: "rgba(10,10,12,0.72)",
        borderTopWidth: Math.max(1, box.height * 0.06),
        borderTopColor: color,
      }}
    >
      <Animated.View
        style={[{ position: "absolute", left: 0, flexDirection: "row" }, moving]}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        <Text style={copy}>{text}</Text>
        <Text style={copy}>{text}</Text>
      </Animated.View>
    </View>
  );
}

// ─── Rule alerts ──────────────────────────────────────────────────────────────

interface RuleAlertItem {
  text: string;
  user: RoomUser;
  durationMs: number;
}

/** Where a fired stream rule's alert text appears. Sounds and read-aloud need no place. */
function RuleAlert({ box }: WidgetProps) {
  const queue = useAlertQueue<RuleAlertItem>((item) => item.durationMs);
  useRuleFired((fired) => {
    for (const alert of fired.alerts) queue.push({ text: alert.text, user: fired.user, durationMs: alert.durationMs });
  });
  const name = useName(queue.current?.item.user);
  const current = queue.current;
  if (!current || current.leaving) return null;
  const avatar = getAvatarUrl(current.item.user.avatarImageUrl) || undefined;
  return (
    <Banner key={current.id} box={box}>
      <Avatar uri={avatar} size={Math.max(16, box.height * 0.6)} name={name} />
      <Text style={{ flex: 1, color: "#fff", fontWeight: "700", fontSize: box.height * 0.26 }} numberOfLines={2}>
        {current.item.text}
      </Text>
    </Banner>
  );
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const OverlayWidgetView = memo(function OverlayWidgetView({ kind, ...props }: WidgetProps & { kind: OverlayKind }) {
  switch (kind) {
    case "tip_alert":
      return <TipAlert {...props} />;
    case "follow_alert":
    case "subscribe_alert":
    case "share_alert":
    case "join_alert":
      return <PersonAlert {...props} kind={kind} />;
    case "goal_bar":
      return <GoalBar {...props} />;
    case "top_supporters":
      return <TopSupporters {...props} />;
    case "viewer_count":
      return <ViewerCount {...props} />;
    case "text":
      return <TextWidget {...props} />;
    case "frame":
      return <Frame {...props} />;
    case "stream_timer":
      return <StreamTimer {...props} />;
    case "reaction_counter":
      return <ReactionCounter {...props} />;
    case "event_feed":
      return <EventFeed {...props} />;
    case "chat_box":
      return <ChatBox {...props} />;
    case "ticker":
      return <Ticker {...props} />;
    case "rule_alert":
      return <RuleAlert {...props} />;
    case "poll":
      return <PollWidget settings={props.settings} box={props.box} />;
    default:
      return null;
  }
});
