/**
 * Decides when the badge ascension ceremony plays.
 *
 * Not at the moment the balance crosses a threshold — a holder who tips over
 * while scrolling, or with the app backgrounded, would spend the animation
 * somewhere it cannot be seen and never get it again. It plays on the first
 * visit to their own profile after the tier went up, which is the one screen
 * where the badge is large, still, and beside their name.
 *
 * What is stored is the tier the holder last saw a ceremony for, not a flag.
 * Someone who climbs two tiers between visits gets one ceremony, for the tier
 * they landed on; someone who drops a tier and earns it back sees it again.
 * Demotions never play.
 *
 * @module hooks/useBadgeCeremony
 */
import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { canonicalTierName } from "../libs/misc";
import { isPromotion } from "../libs/badgeMotion";

const KEY_PREFIX = "dehub.badgeCeremonySeen.";

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

    checking.current = true;
    let cancelled = false;

    AsyncStorage.getItem(key)
      .then((raw) => {
        if (cancelled) return;
        const seen = canonicalTierName(raw);
        if (seen === current) return;
        if (!isPromotion(seen, current)) {
          // A demotion, or a tier already shown. Move the marker so the next
          // genuine promotion is the one that plays.
          return AsyncStorage.setItem(key, current).then(() => undefined);
        }
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

  /** Call when the ceremony ends or is skipped — the marker is written here,
   *  so an interrupted ceremony is not replayed on the next visit. */
  const dismiss = useCallback(() => {
    setCeremony((playing) => {
      const key = storageKey(address);
      if (playing && key) {
        AsyncStorage.setItem(key, playing.to).catch(() => undefined);
      }
      return null;
    });
  }, [address]);

  return { ceremony, dismiss };
}
