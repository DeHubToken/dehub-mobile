import { TurboModuleRegistry } from "react-native";

/**
 * Whether this binary has Skia in it.
 *
 * Skia arrived with a store build, but updates ship JS to every install on
 * the same runtimeVersion, older APKs included. Importing
 * `@shopify/react-native-skia` there throws at import time (its native module
 * is fetched with getEnforcing), so anything drawn with it has to be required
 * behind this check and keep a fallback for builds without it. Same idea as
 * `optionalNative.ts`, which only covers Expo modules; Skia registers as a
 * plain React Native module.
 */
export const HAS_SKIA = (() => {
  try {
    return TurboModuleRegistry.get("RNSkiaModule") != null;
  } catch {
    return false;
  }
})();

/** Require a Skia-drawn module only when Skia is present, else null. */
export function optionalSkia<T>(load: () => T): T | null {
  if (!HAS_SKIA) return null;
  try {
    return load();
  } catch {
    return null;
  }
}
