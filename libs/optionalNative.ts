import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * Load an Expo package only when its native module is in this binary.
 *
 * Updates ship JS to every installed build on the same runtimeVersion, so a
 * bundle can reach an APK built before a native dependency was added. Those
 * packages call requireNativeModule() at import time and throw, which takes
 * the whole app down at launch. Resolving them through here turns a missing
 * module into a feature that is simply off until the next build.
 */
export function optionalNativePackage<T>(nativeModuleName: string, load: () => T): T | null {
  if (!requireOptionalNativeModule(nativeModuleName)) return null;
  try {
    return load();
  } catch {
    return null;
  }
}
