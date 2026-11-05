import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { getDeviceId } from "./device";

/**
 * Android: decode pictures straight into GPU memory (hardware bitmaps), so a
 * scrolling frame no longer uploads every new picture on the render thread.
 *
 * The native half lives in patches/expo-image and only exists in builds made
 * after it landed. On older installs the function is missing and this does
 * nothing. Native defaults to off; this turns it on for a share of devices.
 *
 * Rollout: raise the percentage and ship an update. 0 switches it off
 * everywhere on the next launch.
 *
 * On for every Android 12+ phone (2026-11-05, Images tab jank). Older Android
 * stays off: below 12 a frosted surface would draw pictures through a
 * software canvas, which cannot read a hardware bitmap.
 */
export const HARDWARE_IMAGE_ROLLOUT_PERCENT = 100;
export const HARDWARE_IMAGE_MIN_ANDROID_API = 31;

type NativeImage = { setHardwareBitmapsEnabled?: (on: boolean) => void };

/** 0..99, stable per install. */
export function rolloutBucket(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % 100;
}

export async function applyHardwareImageDecode(percent: number = HARDWARE_IMAGE_ROLLOUT_PERCENT): Promise<boolean> {
  if (Platform.OS !== "android" || percent <= 0) return false;
  if (Number(Platform.Version) < HARDWARE_IMAGE_MIN_ANDROID_API) return false;
  try {
    const native = requireOptionalNativeModule<NativeImage>("ExpoImage");
    if (!native?.setHardwareBitmapsEnabled) return false;
    const on = percent >= 100 || rolloutBucket(await getDeviceId()) < percent;
    native.setHardwareBitmapsEnabled(on);
    return on;
  } catch {
    return false;
  }
}
