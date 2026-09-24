import { useEffect } from "react";
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from "expo-screen-capture";

/**
 * Blocks screenshots, screen recording and the recent-apps thumbnail while
 * `active` (FLAG_SECURE on Android). For any surface that shows or takes a
 * private key or recovery phrase. Keyed, so two secret surfaces open at once
 * do not release each other.
 */
export function useSecureScreen(active: boolean, key: string): void {
  useEffect(() => {
    if (!active) return;
    preventScreenCaptureAsync(key).catch(() => {});
    return () => {
      allowScreenCaptureAsync(key).catch(() => {});
    };
  }, [active, key]);
}
