import { useEffect } from "react";
import { optionalNativePackage } from "./optionalNative";

// Optional for the same reason as haptics: see optionalNative.ts.
const KeepAwake = optionalNativePackage(
  "ExpoKeepAwake",
  () => require("expo-keep-awake") as typeof import("expo-keep-awake"),
);

/** Hold the screen on while `active`. A no-op on a build without the module. */
export function useKeepScreenOn(active: boolean, tag: string): void {
  useEffect(() => {
    if (!active || !KeepAwake) return;
    KeepAwake.activateKeepAwakeAsync(tag).catch(() => {});
    return () => {
      KeepAwake.deactivateKeepAwake(tag).catch(() => {});
    };
  }, [active, tag]);
}
