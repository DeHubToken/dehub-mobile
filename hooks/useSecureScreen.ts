import { useEffect } from "react";
import { Platform } from "react-native";
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
 *
 * Android only. iOS has no system API for this: expo-screen-capture fakes it
 * by re-parenting the whole key window's layer under a hidden secure text
 * field, and laying a black view over the app while the screen is captured.
 * App Review rejects that under Guideline 4 as a custom take on the system
 * screenshot, so iOS keeps the normal system behaviour.
 */
export function useSecureScreen(active: boolean, key: string): void {
  useEffect(() => {
    if (!active || !ScreenCapture || Platform.OS !== "android") return;
    ScreenCapture.preventScreenCaptureAsync(key).catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync(key).catch(() => {});
    };
  }, [active, key]);
}
