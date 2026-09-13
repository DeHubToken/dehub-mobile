import { useEffect, useState } from "react";

/** Allocate playback resources only after the same autoplay candidate has dwelled. */
export function useSettledAutoplay(eligible: boolean, mediaKey: string | undefined, delay: number) {
  const [settledKey, setSettledKey] = useState<string | null>(null);

  useEffect(() => {
    setSettledKey(null);
    if (!eligible || !mediaKey) return;
    const timer = setTimeout(() => setSettledKey(mediaKey), delay);
    return () => clearTimeout(timer);
  }, [eligible, mediaKey, delay]);

  return eligible && !!mediaKey && settledKey === mediaKey;
}
