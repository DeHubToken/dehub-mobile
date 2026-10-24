import { useEffect, useState } from "react";
import { createQrGraphic, type QrGraphic } from "./qrGraphic";

/** Debounce matrix construction while the user is typing a destination or colour. */
export function useQrPreview(content: string, foreground: string, background: string, errorCorrection: NonNullable<QrGraphic["errorCorrection"]>, quietZone: number) {
  const key = JSON.stringify([content, foreground, background, errorCorrection, quietZone]);
  const [ready, setReady] = useState<{ key: string; value: QrGraphic | null } | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      try { setReady({ key, value: createQrGraphic(content, foreground, background, { errorCorrection, quietZone }) }); }
      catch { setReady({ key, value: null }); }
    }, 200);
    return () => clearTimeout(timer);
  }, [key, content, foreground, background, errorCorrection, quietZone]);
  return { value: ready?.key === key ? ready.value : null, pending: ready?.key !== key };
}
