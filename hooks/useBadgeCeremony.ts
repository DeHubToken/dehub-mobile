/**
 * Decides when the badge ascension ceremony plays.
 *
 * Not at the moment the balance crosses a threshold — a holder who tips over
 * while scrolling, or with the app backgrounded, would spend the animation
 * somewhere it cannot be seen and never get it again. It plays on the first
 * visit to their own profile after the tier went up, which is the one screen
 * where the badge is large, still, and beside their name.
 *
 * What is stored is the highest tier the holder has seen a ceremony for, not
 * a flag. Someone who climbs two tiers between visits gets one ceremony, for
 * the tier they landed on. Demotions never play and never lower the marker:
 * the ladder moves with the token price, so a holder near a threshold can
 * flip between two tiers from one visit to the next, and moving the marker
 * down replayed the same ceremony every time they came back.
 *
 * The marker is written before the showcase opens, and a tier is also
 * remembered in memory for the session, so the ceremony can never reopen
 * itself, even if storage is slow or fails.
 *
 * @module hooks/useBadgeCeremony
 */
import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { canonicalTierName } from "../libs/misc";
import { isPromotion } from "../libs/badgeMotion";

const KEY_PREFIX = "dehub.badgeCeremonySeen.";
/** `address:tier` pairs already played this session. */
const played = new Set<string>();

function storageKey(address: string | null | undefined): string | null {
  const a = address?.trim().toLowerCase();
  return a ? `${KEY_PREFIX}${a}` : null;
}

export interface Ceremony {
  /** The tier being left behind — undefined when this is the first badge. */
  from: string | undefined;
  to: string;
}

interface Args {
  /** Own profile only. */
  enabled: boolean;
  address: string | null | undefined;
  tier: string | null | undefined;
}

export function useBadgeCeremony({ enabled, address, tier }: Args) {
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  // The storage read is async, so without this a re-render mid-read can start
  // a second one and show the ceremony twice.
  const checking = useRef(false);
  const current = canonicalTierName(tier);

  useEffect(() => {
    if (!enabled || !current || !address || ceremony || checking.current) return;
    const key = storageKey(address);
    if (!key) return;
    const playedKey = `${key}:${current}`;
    if (played.has(playedKey)) return;

    checking.current = true;
    let cancelled = false;

    AsyncStorage.getItem(key)
      .then((raw) => {
        if (cancelled) return;
        const seen = canonicalTierName(raw);
        if (seen === current) return;
        // A demotion, or a tier already shown: nothing plays, and the marker
        // stays on the highest tier seen.
        if (!isPromotion(seen, current)) return;
        played.add(playedKey);
        AsyncStorage.setItem(key, current).catch(() => undefined);
        setCeremony({ from: seen, to: current });
      })
      .catch(() => {
        // Storage unavailable. The ceremony simply does not play, which is
        // quieter than playing on every profile visit forever.
      })
      .finally(() => {
        checking.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, address, current, ceremony]);

  /** Call once the ceremony has been handed to the badge showcase. The marker
   *  is already written, so one skipped or closed early is not replayed. */
  const dismiss = useCallback(() => setCeremony(null), []);

  return { ceremony, dismiss };
}
