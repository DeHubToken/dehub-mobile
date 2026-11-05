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
  /** True once /profile_counts answered for this address (badges stay blank until then, never a false 0). */
  loaded?: boolean;
}

/**
 * Loads per-tab content counts for a profile so the tab bar can show
 * count badges like the web profile page.
 */
const EMPTY: ProfileContentCounts = {};

export function useProfileContentCounts(address?: string): ProfileContentCounts {
  // Kept with the address it belongs to, so opening another profile never
  // shows the last person's numbers while the new ones load.
  const [read, setRead] = useState<{ address?: string; counts: ProfileContentCounts }>({ counts: {} });

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await apiClient.get<{ result: ProfileContentCounts }>(
          `/profile_counts/${encodeURIComponent(address)}`,
        );
        if (!cancelled) setRead({ address, counts: { ...(response?.result || {}), loaded: true } });
      } catch {
        if (!cancelled) setRead({ address, counts: { loaded: true } });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);
  const counts = read.address === address ? read.counts : EMPTY;

  // The Pinned badge follows the pins list a pin or unpin patches at once,
  // rather than the count read when the profile opened.
  const { data: pins } = useProfilePins(address);
  const pinned = pins?.length;
  // Fractions are on-chain, not in /profile_counts: the same portfolio read
  // the tab lists (shared cache). Left out until it answers, so the badge is
  // blank while loading instead of a false 0. The read is heavy (their last 50
  // posts, three market tables, chain balances, a check per position), so it
  // waits until the first rows and their pictures are in.
  const [fractionsEnabled, setFractionsEnabled] = useState(false);
  useEffect(() => {
    setFractionsEnabled(false);
    if (!address) return;
    const timer = setTimeout(() => setFractionsEnabled(true), 4000);
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
