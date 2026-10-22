/**
 * The widget kinds this app knows how to draw. The twin of dehubweb
 * src/lib/live-overlay/registry.ts.
 *
 * The stream API stores any well-formed kind, so a layout saved by a newer app
 * still loads here; a kind missing from this list is simply not drawn. These
 * names are a contract with dehubweb and with every saved overlay — rename one
 * and every creator who placed it loses it.
 */

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

/** Read a setting, falling back when it is missing or the wrong type. */
export function setting<T extends string | number | boolean>(
  settings: Record<string, unknown> | undefined,
  key: string,
  fallback: T,
): T {
  const value = settings?.[key];
  return typeof value === typeof fallback ? (value as T) : fallback;
}
