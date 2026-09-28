// The one-off voice-clone price in DHB, from the `stage-voice-clone` edge
// function's public quote — the same number web shows. Needs no wallet.

import { supabase } from "../services/supabase";

let quoteOnce: Promise<number | null> | null = null;

export function fetchVoiceClonePrice(): Promise<number | null> {
  quoteOnce ??= supabase.functions
    .invoke("stage-voice-clone", { body: { action: "quote" } })
    .then(({ data }) => {
      const priceDhb = Number((data as { priceDhb?: number } | null)?.priceDhb);
      return priceDhb > 0 ? priceDhb : null;
    })
    .catch(() => null)
    .then((priceDhb) => {
      if (priceDhb === null) quoteOnce = null;
      return priceDhb;
    });
  return quoteOnce;
}
