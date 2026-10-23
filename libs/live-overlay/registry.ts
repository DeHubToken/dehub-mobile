/**
 * The widget kinds this app knows how to draw. The twin of dehubweb
 * src/lib/live-overlay/registry.ts.
 *
 * The stream API stores any well-formed kind, so a layout saved by a newer app
 * still loads here; a kind missing from this list is simply not drawn. These
 * names are a contract with dehubweb and with every saved overlay — rename one
 * and every creator who placed it loses it.
 */

import type { OverlayRect, OverlayWidget } from "./types";

export const OVERLAY_KINDS = [
  "tip_alert",
  "follow_alert",
  "subscribe_alert",
  "share_alert",
  "join_alert",
  "goal_bar",
  "top_supporters",
  "viewer_count",
  "text",
  "frame",
  "stream_timer",
  "reaction_counter",
  "event_feed",
  "chat_box",
  "ticker",
  "rule_alert",
  "poll",
  "spin_wheel",
  "subathon_timer",
  "points_board",
  "streamer_level",
  "tip_jar",
] as const;

export type OverlayKind = (typeof OVERLAY_KINDS)[number];

export function isKnownKind(kind: string): kind is OverlayKind {
  return (OVERLAY_KINDS as readonly string[]).includes(kind);
}

/**
 * Kinds that take over something the app already draws on its own. A stream
 * whose overlay has a tip alert must not also play the built-in celebration,
 * or every gift lands twice.
 */
export const REPLACES_BUILT_IN_CELEBRATION: readonly OverlayKind[] = ["tip_alert"];

/** What quick controls' "pause alerts" hides. Counters, goals and the chat box keep going. */
export const ALERT_KINDS: readonly OverlayKind[] = ["tip_alert", "follow_alert", "subscribe_alert", "share_alert", "join_alert", "rule_alert", "spin_wheel"];

export function isAlertKind(kind: string): boolean {
  return (ALERT_KINDS as readonly string[]).includes(kind);
}

interface WidgetTemplate {
  landscape: OverlayRect;
  portrait: OverlayRect;
  settings: Record<string, unknown>;
}

const PERSON_ALERT: WidgetTemplate = {
  landscape: { x: 0.3, y: 0.05, w: 0.4, h: 0.1 },
  portrait: { x: 0.08, y: 0.14, w: 0.84, h: 0.07 },
  settings: { durationMs: 5000 },
};

/**
 * Where a widget lands when it is first added, for each shape of picture. The
 * same table as dehubweb's, so a widget added on a phone lands where it would
 * have on the web.
 */
export const WIDGET_TEMPLATES: Record<OverlayKind, WidgetTemplate> = {
  tip_alert: {
    landscape: { x: 0.6, y: 0.4, w: 0.38, h: 0.5 },
    portrait: { x: 0.1, y: 0.42, w: 0.8, h: 0.3 },
    settings: { style: "celebration", minAmount: 0, showMessage: true, confirmedOnly: false },
  },
  follow_alert: PERSON_ALERT,
  subscribe_alert: PERSON_ALERT,
  share_alert: PERSON_ALERT,
  join_alert: PERSON_ALERT,
  goal_bar: {
    landscape: { x: 0.02, y: 0.03, w: 0.32, h: 0.09 },
    portrait: { x: 0.05, y: 0.04, w: 0.9, h: 0.06 },
    settings: { metric: "tips", target: 1_000_000, title: "", accent: "#ffffff" },
  },
  top_supporters: {
    landscape: { x: 0.02, y: 0.15, w: 0.22, h: 0.3 },
    portrait: { x: 0.05, y: 0.22, w: 0.45, h: 0.18 },
    settings: { count: 3, title: "" },
  },
  viewer_count: {
    landscape: { x: 0.02, y: 0.48, w: 0.1, h: 0.06 },
    portrait: { x: 0.05, y: 0.42, w: 0.22, h: 0.04 },
    settings: {},
  },
  text: {
    landscape: { x: 0.02, y: 0.62, w: 0.45, h: 0.1 },
    portrait: { x: 0.05, y: 0.62, w: 0.9, h: 0.06 },
    settings: { text: "", subtext: "", style: "lower_third", accent: "#ffffff" },
  },
  frame: {
    landscape: { x: 0, y: 0, w: 1, h: 1 },
    portrait: { x: 0, y: 0, w: 1, h: 1 },
    settings: { style: "solid", thickness: 6, radius: 0, accent: "#ffffff" },
  },
  stream_timer: {
    landscape: { x: 0.13, y: 0.48, w: 0.1, h: 0.06 },
    portrait: { x: 0.3, y: 0.42, w: 0.22, h: 0.04 },
    settings: { label: "", accent: "#ffffff" },
  },
  reaction_counter: {
    landscape: { x: 0.24, y: 0.48, w: 0.1, h: 0.06 },
    portrait: { x: 0.55, y: 0.42, w: 0.22, h: 0.04 },
    settings: { accent: "#ffffff" },
  },
  event_feed: {
    landscape: { x: 0.76, y: 0.12, w: 0.22, h: 0.26 },
    portrait: { x: 0.5, y: 0.22, w: 0.45, h: 0.16 },
    settings: { count: 4, title: "" },
  },
  chat_box: {
    landscape: { x: 0.02, y: 0.56, w: 0.3, h: 0.3 },
    portrait: { x: 0.05, y: 0.5, w: 0.7, h: 0.2 },
    settings: { count: 6, showAvatars: true },
  },
  ticker: {
    landscape: { x: 0.36, y: 0.03, w: 0.38, h: 0.06 },
    portrait: { x: 0.05, y: 0.74, w: 0.9, h: 0.04 },
    settings: { text: "", speed: "normal", accent: "#ffffff" },
  },
  rule_alert: {
    landscape: { x: 0.3, y: 0.17, w: 0.4, h: 0.1 },
    portrait: { x: 0.08, y: 0.32, w: 0.84, h: 0.07 },
    settings: {},
  },
  poll: {
    landscape: { x: 0.36, y: 0.3, w: 0.28, h: 0.34 },
    portrait: { x: 0.1, y: 0.22, w: 0.8, h: 0.2 },
    settings: { accent: "#ffffff" },
  },
  spin_wheel: {
    landscape: { x: 0.7, y: 0.3, w: 0.28, h: 0.45 },
    portrait: { x: 0.2, y: 0.24, w: 0.6, h: 0.3 },
    settings: {},
  },
  subathon_timer: {
    landscape: { x: 0.76, y: 0.03, w: 0.22, h: 0.08 },
    portrait: { x: 0.55, y: 0.04, w: 0.4, h: 0.05 },
    settings: { label: "", accent: "#ffffff" },
  },
  points_board: {
    landscape: { x: 0.76, y: 0.4, w: 0.22, h: 0.3 },
    portrait: { x: 0.05, y: 0.22, w: 0.45, h: 0.18 },
    settings: { count: 5, title: "" },
  },
  streamer_level: {
    landscape: { x: 0.36, y: 0.12, w: 0.22, h: 0.08 },
    portrait: { x: 0.05, y: 0.11, w: 0.5, h: 0.04 },
    settings: { showStreak: true, accent: "#ffffff" },
  },
  tip_jar: {
    landscape: { x: 0.86, y: 0.6, w: 0.12, h: 0.3 },
    portrait: { x: 0.75, y: 0.5, w: 0.2, h: 0.18 },
    settings: { target: 100000, title: "", accent: "#facc15" },
  },
};

/** At most this many widgets; the stream API refuses more. */
export const MAX_WIDGETS = 40;

/** A fresh widget of a kind, with an id no other widget in the list has. */
export function newWidget(kind: OverlayKind, existing: OverlayWidget[]): OverlayWidget {
  const template = WIDGET_TEMPLATES[kind];
  const taken = new Set(existing.map((w) => w.id));
  let n = 1;
  while (taken.has(`${kind}-${n}`)) n += 1;
  return {
    id: `${kind}-${n}`,
    kind,
    enabled: true,
    z: existing.reduce((top, w) => Math.max(top, w.z ?? 0), 0) + 1,
    landscape: { ...template.landscape },
    portrait: { ...template.portrait },
    settings: { ...template.settings },
  };
}

/**
 * Read a setting, falling back when it is missing or the wrong type.
 *
 * Overloaded rather than generic so the result is `string`, not the literal
 * type of the fallback: `setting(s, "style", "celebration")` must be allowed to
 * come back as "banner".
 */
export function setting(settings: Record<string, unknown> | undefined, key: string, fallback: string): string;
export function setting(settings: Record<string, unknown> | undefined, key: string, fallback: number): number;
export function setting(settings: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean;
export function setting(
  settings: Record<string, unknown> | undefined,
  key: string,
  fallback: string | number | boolean,
): string | number | boolean {
  const value = settings?.[key];
  return typeof value === typeof fallback ? (value as string | number | boolean) : fallback;
}
