import { useEffect } from "react";
import { optionalNativePackage } from "../libs/optionalNative";

// Optional: an APK built before expo-screen-capture was added has no native
// module, and importing the package directly crashed it at launch.
const ScreenCapture = optionalNativePackage(
  "ExpoScreenCapture",
  () => require("expo-screen-capture") as typeof import("expo-screen-capture"),
);

/**
 * Blocks screenshots, screen recording and the recent-apps thumbnail while
 * `active` (FLAG_SECURE on Android). For any surface that shows or takes a
 * private key or recovery phrase. Keyed, so two secret surfaces open at once
 * do not release each other.
 */
export function useSecureScreen(active: boolean, key: string): void {
  useEffect(() => {
    if (!active || !ScreenCapture) return;
    ScreenCapture.preventScreenCaptureAsync(key).catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync(key).catch(() => {});
    };
  }, [active, key]);
}
