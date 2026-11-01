import { Platform } from 'react-native';
import * as Device from 'expo-device';

/**
 * Older and low-memory Android phones.
 *
 * Reports of crashes while scrolling came from an Android 11 phone. A feed
 * on a phone like that runs out of memory long before it runs out of CPU:
 * every mounted row keeps its decoded pictures, the theme scene keeps a
 * WebView renderer and a GL context, and each looping preview keeps an
 * ExoPlayer. When the system needs that memory back it kills the app, which
 * the person sees as a crash mid-scroll.
 *
 * A low-end phone gets a lighter app: fewer rows mounted, smaller and
 * cheaper pictures, no looping grid previews, no decorative loops and a still
 * theme scene. Newer phones are untouched. Everything here reads constants
 * the installed binary already exposes (expo-device), so it ships over the air.
 */

const GB = 1024 * 1024 * 1024;
/** Android 11 (API 30) and older. */
const OLD_ANDROID_API = 30;
/** 4GB phones report about 3.6GB; 6GB phones about 5.5GB. */
const LOW_MEMORY_BYTES = 4.5 * GB;
/** Below this the theme scene's WebView renderer is not worth its memory at all. */
const VERY_LOW_MEMORY_BYTES = 3.2 * GB;

export type DeviceTier = 'full' | 'low' | 'veryLow';

function totalMemory(): number | null {
  try {
    const bytes = Device.totalMemory;
    return typeof bytes === 'number' && bytes > 0 ? bytes : null;
  } catch {
    return null;
  }
}

export function classifyDevice(os: string, apiLevel: number, memoryBytes: number | null): DeviceTier {
  if (os !== 'android') return 'full';
  if (memoryBytes != null && memoryBytes < VERY_LOW_MEMORY_BYTES) return 'veryLow';
  if (apiLevel <= OLD_ANDROID_API) return 'low';
  if (memoryBytes != null && memoryBytes < LOW_MEMORY_BYTES) return 'low';
  return 'full';
}

let cached: DeviceTier | null = null;

export function deviceTier(): DeviceTier {
  if (cached == null) cached = classifyDevice(Platform.OS, Number(Platform.Version) || 0, totalMemory());
  return cached;
}

/** True on old or low-memory Android phones. Constant for the life of the process. */
export function isLowEndDevice(): boolean {
  return deviceTier() !== 'full';
}

/** For error rows, so a report can be matched to the lighter app. */
export function deviceTierTag(): { deviceTier: DeviceTier; totalMemoryGb?: number } {
  const bytes = totalMemory();
  return bytes == null ? { deviceTier: deviceTier() } : { deviceTier: deviceTier(), totalMemoryGb: Math.round((bytes / GB) * 10) / 10 };
}

/**
 * How many device pixels per point pictures are fetched at. Full phones cap at
 * 2x (above that nobody can see the difference); low-end phones at 1.5x, which
 * is about half the decoded bytes of a 2x picture.
 */
export function maxImageDensity(): number {
  return isLowEndDevice() ? 1.5 : 2;
}
