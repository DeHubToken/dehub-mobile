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
import Svg, { G, Path, Text as SvgText } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { AccentEdge, Eyebrow, Glass, IconDisc, ListRow, LiveDot, Medal, Ringed, Sheen, withAlpha } from "./premium";
import { WHEEL_SPIN_MS } from "../../libs/live-overlay/rules";
import { PollWidget } from "./poll";
import { PointsBoard, SubathonTimer } from "./subathon";
import { StreamerLevel, TipJar } from "./levelAndJar";

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
      <Text style={{ fontSize: box.height * 0.42, textShadowColor: "rgba(0,0,0,0.45)", textShadowRadius: box.height * 0.06 }}>
        {tier.emoji}
      </Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Eyebrow size={box.height * 0.15}>{t(`liveGift.tier.${tier.key}`, tier.name)}</Eyebrow>
        <NameLine box={box} user={current.item.user} />
        {current.item.message ? (
          <Text style={{ color: "rgba(255,255,255,0.86)", fontWeight: "500", fontSize: box.height * 0.17, marginTop: box.height * 0.05 }} numberOfLines={2}>
            {current.item.message}
          </Text>
        ) : null}
      </View>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: box.height * 0.3, fontVariant: ["tabular-nums"] }}>
        {current.item.amount.toLocaleString()} <DhbCoin size={Math.max(10, box.height * 0.3)} />
      </Text>
    </Banner>
  );
}

function NameLine({ box, user }: { box: WidgetProps["box"]; user: RoomUser }) {
  const name = useName(user);
  return (
    <Text style={{ color: "#fff", fontWeight: "800", fontSize: box.height * 0.29, marginTop: box.height * 0.03 }} numberOfLines={1}>
      {name}
    </Text>
  );
}

function Banner({ box, children }: { box: WidgetProps["box"]; children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.duration(520)} exiting={FadeOutUp.duration(320)} style={{ flex: 1 }}>
      <Glass
        radius={box.height * 0.26}
        shadow={false}
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: box.height * 0.16,
          paddingLeft: box.height * 0.22,
          paddingRight: box.height * 0.24,
        }}
      >
        <AccentEdge height={box.height} />
        {children}
      </Glass>
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
  // A small label over the name: the name is what the room reads first.
  const eyebrow =
    kind === "follow_alert"
      ? t("liveOverlay.eyebrow.follow")
      : kind === "subscribe_alert"
        ? current.item.planName
          ? t("liveOverlay.eyebrow.subscribedTo", { plan: current.item.planName })
          : t("liveOverlay.eyebrow.subscribe")
        : kind === "share_alert"
          ? t("liveOverlay.eyebrow.share")
          : t("liveOverlay.eyebrow.join");
  const avatar = getAvatarUrl(current.item.user.avatarImageUrl) || undefined;
  const size = Math.max(16, box.height * 0.6);

  return (
    <Banner key={current.id} box={box}>
      <Ringed size={size}>
        <Avatar uri={avatar} size={size} name={name} />
      </Ringed>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Eyebrow size={box.height * 0.15}>{eyebrow}</Eyebrow>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: box.height * 0.29, marginTop: box.height * 0.03 }} numberOfLines={1}>
          {name}
        </Text>
      </View>
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
  const [trackWidth, setTrackWidth] = useState(0);

  return (
    <Glass radius={box.height * 0.26} shadow={false} style={{ flex: 1, justifyContent: "center", paddingHorizontal: box.height * 0.24 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 8 }}>
        <Eyebrow size={box.height * 0.15} style={{ flexShrink: 1 }}>
          {reached ? t("liveOverlay.goalReached") : title}
        </Eyebrow>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: font, fontVariant: ["tabular-nums"] }} numberOfLines={1}>
          {Math.floor(value).toLocaleString()} / {target.toLocaleString()}{" "}
          {metric === "tips" ? <DhbCoin size={Math.max(10, font)} /> : t("liveOverlay.followersUnit")}
        </Text>
      </View>
      <View
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        style={{
          marginTop: box.height * 0.11,
          height: box.height * 0.18,
          borderRadius: 999,
          backgroundColor: "rgba(255,255,255,0.07)",
          boxShadow: "inset 0px 1px 2px rgba(0,0,0,0.55)",
          overflow: "hidden",
        }}
      >
        {/* Deepest at the start, full accent at the leading edge, glassy on top. */}
        <LinearGradient
          colors={[withAlpha(color, 0.45), color]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ height: "100%", width: `${progress * 100}%`, borderRadius: 999, overflow: "hidden" }}
        >
          <LinearGradient
            colors={["rgba(255,255,255,0.35)", "rgba(255,255,255,0)"]}
            locations={[0, 0.55]}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
        </LinearGradient>
        <Sheen width={trackWidth} />
      </View>
    </Glass>
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
    <Glass radius={row * 0.42} shadow={false} style={{ flex: 1, paddingHorizontal: row * 0.45, paddingVertical: row * 0.32 }}>
      <Eyebrow size={row * 0.3} style={{ marginBottom: row * 0.12 }}>
        {title}
      </Eyebrow>
      {rows.map((r, i) => (
        <ListRow key={r.address} row={row} first={i === 0}>
          <Medal place={i + 1} size={row * 0.42} />
          <Text style={{ flex: 1, color: "#fff", fontWeight: "600", fontSize: row * 0.4 }} numberOfLines={1}>
            {r.displayName || r.username || t("liveOverlay.someone")}
          </Text>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: row * 0.4, fontVariant: ["tabular-nums"] }}>
            {Math.floor(r.total).toLocaleString()} <DhbCoin size={Math.max(10, row * 0.4)} />
          </Text>
        </ListRow>
      ))}
    </Glass>
  );
}

// ─── Viewer count ─────────────────────────────────────────────────────────────

function ViewerCount({ initialViewers, box }: WidgetProps) {
  const [count, setCount] = useState(initialViewers);
  useOverlayEvent((event: LiveRoomEvent) => {
    if (event.type === "viewers") setCount(event.count);
  });
  const font = box.height * 0.4;
  return (
    <Pill box={box} live>
      <LiveDot size={font * 0.34} />
      <IconDisc size={font * 0.8}>
        <Eye color="#fff" size={font * 0.8} />
      </IconDisc>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: font, fontVariant: ["tabular-nums"] }}>{count.toLocaleString()}</Text>
    </Pill>
  );
}

// ─── Text and lower third ─────────────────────────────────────────────────────

function TextWidget({ settings, box }: WidgetProps) {
  const lowerThird = setting(settings, "style", "plain") === "lower_third";
  const text = setting(settings, "text", "");
  const subtext = setting(settings, "subtext", "");
  if (!text && !subtext) return null;
  const color = accent(settings);
  const Shell = lowerThird ? LowerThirdShell : PlainShell;
  return (
    <Shell box={box} color={color}>
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
        <Text style={{ color: "rgba(255,255,255,0.62)", fontWeight: "500", fontSize: box.height * 0.19 }} numberOfLines={1}>
          {subtext}
        </Text>
      ) : null}
    </Shell>
  );
}

function PlainShell({ children }: { box: WidgetProps["box"]; color: string; children: React.ReactNode }) {
  return <View style={{ flex: 1, justifyContent: "center" }}>{children}</View>;
}

/** Glass with an accent bar down the leading side. */
function LowerThirdShell({ box, color, children }: { box: WidgetProps["box"]; color: string; children: React.ReactNode }) {
  return (
    <Glass radius={box.height * 0.14} shadow={false} style={{ flex: 1, justifyContent: "center", paddingHorizontal: box.height * 0.3 }}>
      <LinearGradient
        colors={[color, withAlpha(color, 0.4)]}
        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: Math.max(2, box.height * 0.06) }}
      />
      {children}
    </Glass>
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

function Pill({ box, live, children }: { box: WidgetProps["box"]; live?: boolean; children: React.ReactNode }) {
  return (
    <Glass
      radius={999}
      style={{
        alignSelf: "flex-start",
        height: "100%",
        flexDirection: "row",
        alignItems: "center",
        gap: box.height * 0.16,
        paddingLeft: box.height * (live ? 0.2 : 0.12),
        paddingRight: box.height * 0.3,
      }}
    >
      {children}
    </Glass>
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
  const font = box.height * 0.4;
  return (
    <Pill box={box}>
      <IconDisc size={font * 0.8}>
        <View style={{ width: font * 0.42, height: font * 0.42, borderRadius: 999, backgroundColor: accent(settings) }} />
      </IconDisc>
      {label ? (
        <Eyebrow size={font * 0.62} style={{ letterSpacing: font * 0.62 * 0.14 }}>
          {label}
        </Eyebrow>
      ) : null}
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: font, fontVariant: ["tabular-nums"] }}>
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
  const font = box.height * 0.4;
  return (
    <Pill box={box}>
      <IconDisc size={font * 0.8}>
        <ThumbsUp color={accent(settings)} size={font * 0.8} />
      </IconDisc>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: font, fontVariant: ["tabular-nums"] }}>
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
    <Glass radius={row * 0.42} shadow={false} style={{ flex: 1, paddingHorizontal: row * 0.45, paddingVertical: row * 0.32 }}>
      {title ? (
        <Eyebrow size={row * 0.3} style={{ marginBottom: row * 0.12 }}>
          {title}
        </Eyebrow>
      ) : null}
      {items.map((item, i) => (
        <FeedRow key={item.id} item={item} row={row} first={i === 0} />
      ))}
    </Glass>
  );
}

function FeedRow({ item, row, first }: { item: FeedItem; row: number; first: boolean }) {
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
      style={{
        height: row,
        flexDirection: "row",
        alignItems: "center",
        gap: row * 0.3,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: "rgba(255,255,255,0.06)",
      }}
    >
      <Text style={{ flex: 1, color: "#fff", fontWeight: "600", fontSize: row * 0.4 }} numberOfLines={1}>
        {line}
      </Text>
      {item.kind === "tip" ? (
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: row * 0.4, fontVariant: ["tabular-nums"] }}>
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
        <Glass radius={row * 0.45} style={[chatLineStyle(row), { paddingLeft: row * 0.36 }]}>
          <Text style={{ color: "rgba(255,255,255,0.62)", fontSize: row * 0.4 }} numberOfLines={1}>
            {t("liveOverlay.chatPreview")}
          </Text>
        </Glass>
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
    paddingLeft: row * 0.16,
    paddingRight: row * 0.36,
  };
}

function ChatLine({ line, row, showAvatar }: { line: OverlayChatLine; row: number; showAvatar: boolean }) {
  const name = useName(line.user);
  const avatar = getAvatarUrl(line.user.avatarImageUrl) || undefined;
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={{ alignSelf: "flex-start", maxWidth: "100%" }}>
      <Glass radius={row * 0.45} style={chatLineStyle(row)}>
        {showAvatar ? (
          <Ringed size={Math.max(12, row * 0.6)}>
            <Avatar uri={avatar} size={Math.max(12, row * 0.6)} name={name} />
          </Ringed>
        ) : null}
        <Text style={{ flexShrink: 1, color: "rgba(255,255,255,0.86)", fontWeight: "500", fontSize: row * 0.4 }} numberOfLines={1}>
          <Text style={{ fontWeight: "800", color: "#fff" }}>{name} </Text>
          {line.text}
        </Text>
      </Glass>
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
  const font = box.height * 0.44;
  const copy = { color: "#fff", fontWeight: "700" as const, fontSize: font, paddingRight: font * 4, flexShrink: 0 };
  const fade = Math.max(8, box.width * 0.05);
  return (
    <Glass radius={0} shadow={false} style={{ flex: 1, justifyContent: "center", borderWidth: 0 }}>
      <Animated.View
        style={[{ position: "absolute", left: 0, flexDirection: "row" }, moving]}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        <Text style={copy}>{text}</Text>
        <Text style={copy}>{text}</Text>
      </Animated.View>
      {/* Text fades out at the edges instead of being cut. */}
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(14,14,17,0.95)", "rgba(14,14,17,0)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: fade }}
      />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(14,14,17,0)", "rgba(14,14,17,0.95)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: fade }}
      />
      {/* An accent hairline along the top that fades out to the sides. */}
      <LinearGradient
        pointerEvents="none"
        colors={["transparent", color, color, "transparent"]}
        locations={[0, 0.2, 0.8, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: "absolute", left: 0, right: 0, top: 0, height: Math.max(1, box.height * 0.05) }}
      />
    </Glass>
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
    const show = () => {
      for (const alert of fired.alerts) queue.push({ text: alert.text, user: fired.user, durationMs: alert.durationMs });
    };
    // An alert that names where a wheel stopped waits until it has stopped.
    if (fired.wheels.length) setTimeout(show, WHEEL_SPIN_MS);
    else show();
  });
  const name = useName(queue.current?.item.user);
  const current = queue.current;
  if (!current || current.leaving) return null;
  const avatar = getAvatarUrl(current.item.user.avatarImageUrl) || undefined;
  return (
    <Banner key={current.id} box={box}>
      <Ringed size={Math.max(16, box.height * 0.6)}>
        <Avatar uri={avatar} size={Math.max(16, box.height * 0.6)} name={name} />
      </Ringed>
      <Text style={{ flex: 1, color: "#fff", fontWeight: "800", fontSize: box.height * 0.26 }} numberOfLines={2}>
        {current.item.text}
      </Text>
    </Banner>
  );
}

// ─── Spin wheel ───────────────────────────────────────────────────────────────

const WHEEL_COLORS = ["#f43f5e", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#14b8a6", "#ec4899", "#eab308", "#6366f1", "#10b981", "#ef4444", "#0ea5e9"];
const WHEEL_HOLD_MS = 4000;
const shortLabel = (s: string) => (s.slice(0, 14) === s ? s : `${s.slice(0, 13)}…`);

interface SpinItem {
  segments: string[];
  result: number;
  user: RoomUser;
}

/**
 * A stream rule's wheel. The server already chose where it stops; this only
 * turns it there, so every viewer lands on the same answer. The twin of
 * dehubweb's SpinWheel.
 */
function SpinWheel({ box }: WidgetProps) {
  const queue = useAlertQueue<SpinItem>(() => WHEEL_SPIN_MS + WHEEL_HOLD_MS);
  useRuleFired((fired) => {
    for (const wheel of fired.wheels) queue.push({ ...wheel, user: fired.user });
  });
  const current = queue.current;
  if (!current || current.leaving) return null;
  return <WheelFace key={current.id} item={current.item} box={box} />;
}

function WheelFace({ item, box }: { item: SpinItem; box: WidgetProps["box"] }) {
  const { t } = useTranslation();
  const name = useName(item.user);
  const n = item.segments.length;
  const slice = 360 / n;
  const d = Math.min(box.width, box.height * 0.82);
  const r = d / 2;
  const target = 360 * 5 + (360 - (item.result + 0.5) * slice);
  const angle = useSharedValue(0);
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    angle.value = withTiming(target, { duration: WHEEL_SPIN_MS, easing: Easing.bezier(0.12, 0.8, 0.12, 1) });
    const done = setTimeout(() => setLanded(true), WHEEL_SPIN_MS);
    return () => {
      clearTimeout(done);
      cancelAnimation(angle);
    };
  }, [angle, target]);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));

  // One pie slice per segment, starting at the top and going clockwise.
  const point = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${r + r * Math.cos(rad)} ${r + r * Math.sin(rad)}`;
  };
  return (
    <Animated.View entering={FadeInDown.duration(250)} exiting={FadeOutUp.duration(300)} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: d * 0.04 }}>
      <View style={{ width: d, height: d }}>
        <Animated.View style={[{ width: d, height: d }, spinStyle]}>
          <Svg width={d} height={d}>
            {item.segments.map((segment, i) => {
              const from = i * slice;
              const to = (i + 1) * slice;
              // A slice is never more than half the wheel (two segments at least).
              const large = 0;
              const mid = ((from + to) / 2 - 90) * (Math.PI / 180);
              return (
                <G key={i}>
                  <Path d={`M ${r} ${r} L ${point(from)} A ${r} ${r} 0 ${large} 1 ${point(to)} Z`} fill={WHEEL_COLORS[i % WHEEL_COLORS.length]} />
                  <SvgText
                    x={r + r * 0.62 * Math.cos(mid)}
                    y={r + r * 0.62 * Math.sin(mid)}
                    fill="#ffffff"
                    fontSize={Math.max(8, d * 0.055)}
                    fontWeight="700"
                    textAnchor="middle"
                    alignmentBaseline="middle"
                    transform={`rotate(${(from + to) / 2}, ${r + r * 0.62 * Math.cos(mid)}, ${r + r * 0.62 * Math.sin(mid)})`}
                  >
                    {shortLabel(segment)}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        </Animated.View>
        <View
          style={{
            position: "absolute",
            top: -d * 0.02,
            left: d / 2 - d * 0.05,
            width: 0,
            height: 0,
            borderLeftWidth: d * 0.05,
            borderRightWidth: d * 0.05,
            borderTopWidth: d * 0.09,
            borderLeftColor: "transparent",
            borderRightColor: "transparent",
            borderTopColor: "#ffffff",
          }}
        />
      </View>
      {landed ? (
        <Glass radius={999} style={{ paddingHorizontal: d * 0.05, paddingVertical: d * 0.02, maxWidth: box.width }}>
          <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "700", fontSize: Math.max(10, d * 0.06) }}>
            {t("liveOverlay.wheelLanded", { name, result: item.segments[item.result] })}
          </Text>
        </Glass>
      ) : null}
    </Animated.View>
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
    case "spin_wheel":
      return <SpinWheel {...props} />;
    case "subathon_timer":
      return <SubathonTimer settings={props.settings} box={props.box} />;
    case "points_board":
      return <PointsBoard settings={props.settings} box={props.box} />;
    case "streamer_level":
      return <StreamerLevel settings={props.settings} box={props.box} />;
    case "tip_jar":
      return <TipJar settings={props.settings} stats={props.stats} box={props.box} />;
    default:
      return null;
  }
});
