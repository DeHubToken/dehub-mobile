/**
 * Opens a badge showcase from anywhere a badge is drawn. One host mounted
 * in App renders it, so a tap inside the showcase never reaches the feed card
 * or row the badge was sitting in.
 */
import { useSyncExternalStore } from "react";
import { BADGE_ORDER, badgeImage } from "./misc";
import type { StreamerBadgeId } from "./streamer-badge-art";

/** Anything that can report where it sits on screen: a host view instance. */
export interface MeasurableAnchor {
  measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
}

interface RequestBase {
  anchor: MeasurableAnchor | null;
  /** Changes on every open so reopening the same badge starts fresh. */
  id: number;
}

/** A staking tier next to someone's name. */
export interface HolderShowcaseRequest extends RequestBase {
  kind: "holder";
  tier: string | null;
}

/** A collectible card on a streamer's ladder. */
export interface StreamerShowcaseRequest extends RequestBase {
  kind: "streamer";
  badgeId: StreamerBadgeId;
  /** Whose ladder it is. */
  address: string;
  /** True on your own ladder, where earned cards can be equipped. */
  canSelect: boolean;
}

export type BadgeShowcaseRequest = HolderShowcaseRequest | StreamerShowcaseRequest;

let current: BadgeShowcaseRequest | null = null;
let sequence = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openBadgeShowcase(tier: string | null | undefined, anchor?: MeasurableAnchor | null) {
  current = { kind: "holder", tier: tier ?? null, anchor: anchor ?? null, id: ++sequence };
  emit();
}

export function openStreamerShowcase(
  badgeId: StreamerBadgeId,
  address: string,
  canSelect: boolean,
  anchor?: MeasurableAnchor | null,
) {
  current = { kind: "streamer", badgeId, address, canSelect, anchor: anchor ?? null, id: ++sequence };
  emit();
}

export function closeBadgeShowcase() {
  if (!current) return;
  current = null;
  emit();
}

export function useBadgeShowcaseRequest(): BadgeShowcaseRequest | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** The tier a badge image stands for, for surfaces that only hold the art. */
export function tierForBadgeImage(source: unknown): string | null {
  if (source === undefined || source === null) return null;
  return (
    BADGE_ORDER.find((name) => badgeImage(name) === source || badgeImage(name, "light") === source) ?? null
  );
}
