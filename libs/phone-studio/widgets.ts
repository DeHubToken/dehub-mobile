/**
 * The creator's overlay widgets, as data a painter can draw into the outgoing
 * video. Pure: room events in, a list of drawings out, time passed in rather
 * than read, so every rule here is tested without a clock or a canvas.
 *
 * This holds the same state the in-app widgets hold (components/LiveOverlay/
 * OverlayWidgets.tsx) and reacts to the same LiveRoomEvents, with the same
 * placement (libs/live-overlay/layout.ts) against a picture that is the whole
 * frame. What it cannot carry over is motion: alerts appear and disappear
 * rather than slide, and a ticker steps a few times a second, because the
 * painted overlay is re-sent to the encoder at most four times a second.
 *
 * Drawn here: tip / follow / subscribe / share / join alerts, goal bar, top
 * supporters, viewer count, stream timer, reaction counter, event feed, chat
 * box, text and lower third, ticker, frame. Not drawn (they need the rule
 * bus, polls, subathon or level data the producer does not hold): rule_alert,
 * spin_wheel, poll, subathon_timer, points_board, streamer_level, tip_jar.
 */
import { tierFromGift } from "../../config/gift-tiers";
import { drawOrder, rectFor } from "../live-overlay/layout";
import { isAlertKind, setting, type OverlayKind } from "../live-overlay/registry";
import type { OverlayControls, OverlayRect, OverlayStats, OverlayWidget } from "../live-overlay/types";

/** Mirrors components/LiveOverlay/overlayEvents.ts without importing React. */
export interface RoomUser {
  address?: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
}

export type RoomEvent =
  | { type: "tip"; amount: number; selectedTier?: string; user: RoomUser; message?: string; transactionHash?: string }
  | { type: "tipConfirmed"; paidAmount: number; address: string; transactionHash: string; user?: RoomUser; selectedTier?: string; message?: string }
  | { type: "follow" | "share" | "join"; user: RoomUser }
  | { type: "subscribe"; user: RoomUser; planName?: string }
  | { type: "viewers"; count: number }
  | { type: "reaction"; reactionType: string; user: RoomUser };

export interface ChatLine {
  id: string;
  text: string;
  user: RoomUser;
}

export interface SupporterRow {
  address: string;
  displayName?: string;
  username?: string;
  total: number;
}

export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The widget kinds this module can draw. */
export const PAINTED_KINDS: readonly OverlayKind[] = [
  "tip_alert",
  "follow_alert",
  "subscribe_alert",
  "share_alert",
  "join_alert",
  "goal_bar",
  "top_supporters",
  "viewer_count",
  "stream_timer",
  "reaction_counter",
  "event_feed",
  "chat_box",
  "text",
  "ticker",
  "frame",
];

export function isPaintedKind(kind: string): boolean {
  return (PAINTED_KINDS as readonly string[]).includes(kind);
}

// ─── Drawings ─────────────────────────────────────────────────────────────────

export type WidgetDrawing =
  | { type: "banner"; initial: string; title: string; detail?: string; message?: string; coin?: boolean }
  | { type: "goal"; title: string; value: string; unit?: string; coin: boolean; progress: number; accent: string }
  | { type: "pill"; icon: "eye" | "dot" | "thumb"; accent: string; label?: string; value: string }
  | { type: "list"; title?: string; slots: number; rows: Array<{ rank?: string; name: string; value?: string; coin?: boolean }> }
  | { type: "chat"; slots: number; lines: Array<{ name: string; text: string }> }
  | { type: "text"; text: string; subtext: string; lowerThird: boolean; accent: string }
  | { type: "ticker"; text: string; accent: string; phase: number }
  | { type: "frame"; accent: string; thickness: number; radius: number; glow: boolean };

export interface PlacedDrawing {
  id: string;
  rect: OverlayRect;
  drawing: WidgetDrawing;
}

// ─── Alert queue ──────────────────────────────────────────────────────────────

/** Gap between one alert leaving and the next arriving, as the in-app queue leaves room for its exit animation. */
export const ALERT_GAP_MS = 380;
/** Never hold more than this many alerts waiting; the oldest waiting is dropped. */
export const MAX_WAITING = 8;

/** One alert on screen at a time, each for its own duration. The twin of useAlertQueue, on a passed-in clock. */
export class AlertQueue<T> {
  private waiting: Array<{ item: T; duration: number }> = [];
  private current: { item: T; until: number } | null = null;
  private freeAt = 0;

  push(item: T, durationMs: number, now: number): void {
    this.waiting.push({ item, duration: Math.max(1500, durationMs) });
    if (this.waiting.length > MAX_WAITING) this.waiting.shift();
    this.advance(now);
  }

  /** The alert showing at `now`, if any. */
  at(now: number): T | null {
    this.advance(now);
    return this.current?.item ?? null;
  }

  private advance(now: number): void {
    if (this.current && now >= this.current.until) {
      this.freeAt = this.current.until + ALERT_GAP_MS;
      this.current = null;
    }
    if (!this.current && this.waiting.length && now >= this.freeAt) {
      const next = this.waiting.shift()!;
      this.current = { item: next.item, until: now + next.duration };
    }
  }
}

// ─── Board ────────────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-f]{6}$/i;
function accentOf(settings: Record<string, unknown>, fallback = "#ffffff"): string {
  const c = setting(settings, "accent", fallback);
  return HEX.test(c) ? c : fallback;
}

const PERSON_EVENT: Partial<Record<OverlayKind, RoomEvent["type"]>> = {
  follow_alert: "follow",
  subscribe_alert: "subscribe",
  share_alert: "share",
  join_alert: "join",
};

const TICKER_SECONDS: Record<string, number> = { slow: 30, normal: 18, fast: 10 };
const CONFIRM_WAIT_MS = 120_000;

interface TipItem {
  amount: number;
  selectedTier?: string;
  user: RoomUser;
  message?: string;
}

interface PersonItem {
  user: RoomUser;
  planName?: string;
}

interface FeedItem {
  kind: "tip" | "follow" | "subscribe" | "share";
  user: RoomUser;
  amount?: number;
  planName?: string;
}

interface WidgetState {
  tips?: AlertQueue<TipItem>;
  held?: Map<string, { item: TipItem; at: number }>;
  people?: AlertQueue<PersonItem>;
  seen?: Set<string>;
  delta?: number;
  deltaBase?: number;
  feed?: FeedItem[];
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function formatNumber(n: number): string {
  try {
    return Math.floor(n).toLocaleString();
  } catch {
    return String(Math.floor(n));
  }
}

function initialOf(name: string): string {
  const ch = Array.from(name.trim())[0];
  return ch ? ch.toUpperCase() : "?";
}

/**
 * Every widget the creator placed, with the state each one keeps, driven by
 * room events. `frame(now)` is everything to draw at that instant.
 */
export class WidgetBoard {
  private widgets: OverlayWidget[] = [];
  private stats: OverlayStats = { totalTips: 0, followers: 0 };
  private controls: OverlayControls | undefined;
  private viewers = 0;
  private chat: ChatLine[] = [];
  private supporters: SupporterRow[] = [];
  private state = new Map<string, WidgetState>();
  private streamStartedAt: number | null = null;
  private createdAt: number;

  constructor(private translate: Translate, now: number) {
    this.createdAt = now;
  }

  setTranslate(translate: Translate): void {
    this.translate = translate;
  }

  setOverlay(widgets: OverlayWidget[], stats?: OverlayStats, controls?: OverlayControls): void {
    this.widgets = drawOrder(widgets.filter((w) => w && w.enabled && isPaintedKind(w.kind)));
    if (stats) this.stats = stats;
    this.controls = controls;
    const ids = new Set(this.widgets.map((w) => w.id));
    for (const id of Array.from(this.state.keys())) if (!ids.has(id)) this.state.delete(id);
  }

  /** When the broadcast went live, for the stream timer when the server has not said. */
  setStreamStartedAt(at: number | null): void {
    this.streamStartedAt = at;
  }

  setViewers(count: number): void {
    if (Number.isFinite(count) && count >= 0) this.viewers = count;
  }

  setChat(lines: ChatLine[]): void {
    this.chat = lines;
  }

  setSupporters(rows: SupporterRow[]): void {
    this.supporters = rows;
  }

  get hasWidgets(): boolean {
    return this.widgets.length > 0;
  }

  private stateOf(id: string): WidgetState {
    let s = this.state.get(id);
    if (!s) {
      s = {};
      this.state.set(id, s);
    }
    return s;
  }

  private name(user: RoomUser | undefined): string {
    return user?.displayName || user?.username || this.translate("liveOverlay.someone");
  }

  publish(event: RoomEvent, now: number): void {
    if (event.type === "viewers") {
      this.setViewers(event.count);
      return;
    }
    for (const widget of this.widgets) {
      const kind = widget.kind as OverlayKind;
      const settings = widget.settings || {};
      const s = this.stateOf(widget.id);
      if (kind === "tip_alert") this.onTip(s, settings, event, now);
      else if (PERSON_EVENT[kind]) this.onPerson(s, settings, kind, event, now);
      else if (kind === "goal_bar") this.onGoal(s, settings, event);
      else if (kind === "reaction_counter" && event.type === "reaction") s.delta = (s.delta ?? 0) + 1;
      else if (kind === "event_feed") this.onFeed(s, settings, event);
    }
  }

  private onTip(s: WidgetState, settings: Record<string, unknown>, event: RoomEvent, now: number) {
    const minAmount = setting(settings, "minAmount", 0);
    const showMessage = setting(settings, "showMessage", true);
    const confirmedOnly = setting(settings, "confirmedOnly", false);
    s.tips ??= new AlertQueue<TipItem>();
    s.held ??= new Map();
    const play = (item: TipItem) => {
      if (item.amount < minAmount) return;
      const shown = showMessage ? item : { ...item, message: undefined };
      s.tips!.push(shown, tierFromGift(shown).durationMs, now);
    };
    if (event.type === "tip") {
      const item = { amount: event.amount, selectedTier: event.selectedTier, user: event.user, message: event.message };
      if (!confirmedOnly) return play(item);
      if (!event.transactionHash) return;
      for (const [hash, entry] of s.held) if (now - entry.at > CONFIRM_WAIT_MS) s.held.delete(hash);
      s.held.set(event.transactionHash, { item, at: now });
    } else if (event.type === "tipConfirmed" && confirmedOnly) {
      const entry = s.held.get(event.transactionHash);
      if (!entry) return;
      s.held.delete(event.transactionHash);
      play({ ...entry.item, amount: event.paidAmount, selectedTier: undefined });
    }
  }

  private onPerson(s: WidgetState, settings: Record<string, unknown>, kind: OverlayKind, event: RoomEvent, now: number) {
    if (event.type !== PERSON_EVENT[kind] || !("user" in event) || !event.user) return;
    s.people ??= new AlertQueue<PersonItem>();
    if (event.type === "join") {
      // The gateway re-sends a viewer's join on every reconnect. Each person arrives once.
      s.seen ??= new Set();
      const key = event.user.address;
      if (!key || s.seen.has(key)) return;
      s.seen.add(key);
    }
    s.people.push(
      { user: event.user, planName: event.type === "subscribe" ? event.planName : undefined },
      setting(settings, "durationMs", 5000),
      now,
    );
  }

  private onGoal(s: WidgetState, settings: Record<string, unknown>, event: RoomEvent) {
    const metric = setting(settings, "metric", "tips") === "followers" ? "followers" : "tips";
    if (metric === "tips" && event.type === "tipConfirmed") s.delta = (s.delta ?? 0) + event.paidAmount;
    if (metric === "followers" && event.type === "follow") s.delta = (s.delta ?? 0) + 1;
  }

  private onFeed(s: WidgetState, settings: Record<string, unknown>, event: RoomEvent) {
    const count = Math.min(8, Math.max(1, setting(settings, "count", 4)));
    let item: FeedItem | null = null;
    if (event.type === "tipConfirmed") item = { kind: "tip", user: event.user ?? { address: event.address }, amount: event.paidAmount };
    else if (event.type === "follow" || event.type === "share") item = { kind: event.type, user: event.user };
    else if (event.type === "subscribe") item = { kind: "subscribe", user: event.user, planName: event.planName };
    if (!item) return;
    s.feed = [item, ...(s.feed ?? [])].slice(0, count);
  }

  /** A counter's figure, counted on top of the server's until the server's moves. */
  private counted(s: WidgetState, base: number): number {
    if (s.deltaBase === undefined) {
      s.deltaBase = base;
    } else if (s.deltaBase !== base) {
      s.deltaBase = base;
      s.delta = 0;
    }
    return base + (s.delta ?? 0);
  }

  /** Everything to draw at `now`, in draw order, for a portrait or landscape frame. */
  frame(now: number, portrait: boolean): PlacedDrawing[] {
    const out: PlacedDrawing[] = [];
    const t = this.translate;
    for (const widget of this.widgets) {
      const kind = widget.kind as OverlayKind;
      if (this.controls?.alertsPaused && isAlertKind(kind)) continue;
      const settings = widget.settings || {};
      const s = this.stateOf(widget.id);
      const drawing = this.draw(kind, settings, s, now, t);
      if (drawing) out.push({ id: widget.id, rect: rectFor(widget, portrait), drawing });
    }
    return out;
  }

  private draw(kind: OverlayKind, settings: Record<string, unknown>, s: WidgetState, now: number, t: Translate): WidgetDrawing | null {
    switch (kind) {
      case "tip_alert": {
        const item = s.tips?.at(now);
        if (!item) return null;
        const tier = tierFromGift(item);
        const name = this.name(item.user);
        return {
          type: "banner",
          initial: initialOf(name),
          title: name,
          detail: `${t(`liveGift.tier.${tier.key}`, { defaultValue: tier.name })} · ${formatNumber(item.amount)}`,
          coin: true,
          message: item.message || undefined,
        };
      }
      case "follow_alert":
      case "subscribe_alert":
      case "share_alert":
      case "join_alert": {
        const item = s.people?.at(now);
        if (!item) return null;
        const name = this.name(item.user);
        const line =
          kind === "follow_alert"
            ? t("liveOverlay.newFollower", { name })
            : kind === "subscribe_alert"
              ? item.planName
                ? t("liveOverlay.subscribedTo", { name, plan: item.planName })
                : t("liveOverlay.newSubscriber", { name })
              : kind === "share_alert"
                ? t("liveOverlay.shared", { name })
                : t("liveOverlay.joined", { name });
        return { type: "banner", initial: initialOf(name), title: line };
      }
      case "goal_bar": {
        const metric = setting(settings, "metric", "tips") === "followers" ? "followers" : "tips";
        const target = Math.max(1, setting(settings, "target", metric === "tips" ? 1_000_000 : 1000));
        const base = metric === "tips" ? this.stats.totalTips : this.stats.followers;
        const value = this.counted(s, Number(base) || 0);
        const reached = value >= target;
        return {
          type: "goal",
          title: reached ? t("liveOverlay.goalReached") : setting(settings, "title", ""),
          value: `${formatNumber(value)} / ${formatNumber(target)}`,
          unit: metric === "followers" ? t("liveOverlay.followersUnit") : undefined,
          coin: metric === "tips",
          progress: Math.min(1, value / target),
          accent: accentOf(settings),
        };
      }
      case "top_supporters": {
        const count = Math.min(10, Math.max(1, setting(settings, "count", 3)));
        return {
          type: "list",
          title: setting(settings, "title", "") || t("liveOverlay.topSupporters"),
          slots: count,
          rows: this.supporters.slice(0, count).map((r, i) => ({
            rank: String(i + 1),
            name: r.displayName || r.username || t("liveOverlay.someone"),
            value: formatNumber(r.total),
            coin: true,
          })),
        };
      }
      case "viewer_count":
        return { type: "pill", icon: "eye", accent: "#ffffff", value: formatNumber(this.viewers) };
      case "stream_timer": {
        const started = this.stats.startedAt ? Date.parse(this.stats.startedAt) : NaN;
        const from = Number.isFinite(started) ? started : this.streamStartedAt ?? this.createdAt;
        const label = setting(settings, "label", "");
        return { type: "pill", icon: "dot", accent: accentOf(settings), label: label || undefined, value: formatElapsed(now - from) };
      }
      case "reaction_counter":
        return {
          type: "pill",
          icon: "thumb",
          accent: accentOf(settings),
          value: formatNumber(this.counted(s, Number(this.stats.reactions) || 0)),
        };
      case "event_feed": {
        const count = Math.min(8, Math.max(1, setting(settings, "count", 4)));
        const title = setting(settings, "title", "");
        return {
          type: "list",
          title: title || undefined,
          slots: count,
          rows: (s.feed ?? []).map((item) => {
            const name = this.name(item.user);
            const text =
              item.kind === "tip"
                ? t("liveOverlay.tipped", { name })
                : item.kind === "follow"
                  ? t("liveOverlay.newFollower", { name })
                  : item.kind === "subscribe"
                    ? item.planName
                      ? t("liveOverlay.subscribedTo", { name, plan: item.planName })
                      : t("liveOverlay.newSubscriber", { name })
                    : t("liveOverlay.shared", { name });
            return item.kind === "tip"
              ? { name: text, value: formatNumber(item.amount ?? 0), coin: true }
              : { name: text };
          }),
        };
      }
      case "chat_box": {
        const count = Math.min(12, Math.max(1, setting(settings, "count", 6)));
        const lines = this.chat.slice(-count).map((line) => ({ name: this.name(line.user), text: line.text }));
        return lines.length ? { type: "chat", slots: count, lines } : null;
      }
      case "text": {
        const text = setting(settings, "text", "");
        const subtext = setting(settings, "subtext", "");
        if (!text && !subtext) return null;
        return { type: "text", text, subtext, lowerThird: setting(settings, "style", "plain") === "lower_third", accent: accentOf(settings) };
      }
      case "ticker": {
        const text = setting(settings, "text", "");
        if (!text) return null;
        const seconds = TICKER_SECONDS[setting(settings, "speed", "normal")] ?? TICKER_SECONDS.normal;
        // Quantised to the repaint rate, so an idle ticker does not look changed every tick.
        const phase = Math.floor((((now - this.createdAt) / (seconds * 1000)) % 1) * 400) / 400;
        return { type: "ticker", text, accent: accentOf(settings), phase };
      }
      case "frame":
        return {
          type: "frame",
          accent: accentOf(settings),
          thickness: Math.min(80, Math.max(1, setting(settings, "thickness", 6))),
          radius: Math.min(300, Math.max(0, setting(settings, "radius", 0))),
          glow: setting(settings, "style", "solid") === "glow",
        };
      default:
        return null;
    }
  }
}

/** A stable key for a frame's drawings: unchanged key, unchanged picture, nothing to send. */
export function drawingsKey(drawings: PlacedDrawing[]): string {
  return JSON.stringify(drawings);
}
