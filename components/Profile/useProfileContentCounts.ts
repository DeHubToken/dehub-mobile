import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../libs";
import { useProfilePins } from "../../hooks/usePinnedPosts";
import { useFractionPortfolio, livePositions } from "../../hooks/useFractionPortfolio";

export interface ProfileContentCounts {
  home?: number;
  posts?: number;
  images?: number;
  videos?: number;
  songs?: number;
  live?: number;
  subscribers?: number;
  pinned?: number;
  playlists?: number;
  articles?: number;
  fractions?: number;
}

/**
 * Loads per-tab content counts for a profile so the tab bar can show
 * count badges like the web profile page.
 */
export function useProfileContentCounts(address?: string): ProfileContentCounts {
  const [counts, setCounts] = useState<ProfileContentCounts>({});

  useEffect(() => {
    if (!address) {
      setCounts({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await apiClient.get<{ result: ProfileContentCounts }>(
          `/profile_counts/${encodeURIComponent(address)}`,
        );
        if (!cancelled) setCounts(response?.result || {});
      } catch {
        if (!cancelled) setCounts({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  // The Pinned badge follows the pins list a pin or unpin patches at once,
  // rather than the count read when the profile opened.
  const { data: pins } = useProfilePins(address);
  const pinned = pins?.length;
  // Fractions are on-chain, not in /profile_counts: the same portfolio read
  // the tab lists (shared cache). Left out until it answers, so the badge is
  // blank while loading instead of a false 0. Starts a beat after the profile
  // so the first content page wins the network.
  const [fractionsEnabled, setFractionsEnabled] = useState(false);
  useEffect(() => {
    setFractionsEnabled(false);
    if (!address) return;
    const timer = setTimeout(() => setFractionsEnabled(true), 800);
    return () => clearTimeout(timer);
  }, [address]);
  const { data: fractionPositions } = useFractionPortfolio(address, { enabled: fractionsEnabled });
  const fractions = fractionPositions ? livePositions(fractionPositions).length : undefined;
  return useMemo(() => {
    let out = counts;
    if (pinned !== undefined) out = { ...out, pinned };
    if (fractions !== undefined) out = { ...out, fractions };
    return out;
  }, [counts, pinned, fractions]);
}
