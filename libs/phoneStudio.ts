import { NativeModules, Platform, TurboModuleRegistry } from "react-native";

/**
 * The phone studio's native half: background removal, scene cards and the
 * overlay of logos and widgets, all burned into the outgoing video by frame
 * processors that sit after the camera look in react-native-webrtc's effect
 * chain (android/.../studio/, ios/DeHub/DHBStudio.m).
 *
 * Pictures cross the bridge as PNG file paths: JS draws them with Skia, writes
 * the file, and the native side decodes it once and lays it out for the
 * camera's own geometry. Each call resolves when the picture is in place, so
 * the caller may delete the file as soon as it does.
 *
 * Updates ship JS to every binary on the same runtimeVersion, so this bundle
 * can land on a build that has no studio at all. Every function here is a
 * resolved no-op there, and `phoneStudioSupported` says so up front so the UI
 * can hide what it cannot do.
 */

export type BackgroundMode = "none" | "blur" | "color" | "image";

export interface FrameSize {
  width: number;
  height: number;
}

interface NativeStudio {
  setBackground(mode: BackgroundMode, color: string | null, imagePath: string | null): Promise<void>;
  setOverlay(pngPath: string | null): Promise<void>;
  setCard(pngPath: string | null, fade: boolean): Promise<void>;
  getFrameSize(): Promise<FrameSize | null>;
  reset(): Promise<void>;
  getConstants?: () => { version?: number; segmentation?: boolean };
  version?: number;
  segmentation?: boolean;
}

/** Names the native side registers its processors under. A contract with both platforms. */
export const STUDIO_BACKGROUND_PROCESSOR = "dhb-background";
export const STUDIO_OVERLAY_PROCESSOR = "dhb-studio";

/**
 * The frame size a picture is drawn at before the camera has reported one:
 * react-native-webrtc's default 1280×720 capture, upright on a portrait phone.
 */
export const DEFAULT_FRAME: FrameSize = { width: 720, height: 1280 };

function resolveModule(): NativeStudio | null {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return null;
  try {
    const turbo = TurboModuleRegistry.get<any>("DHBStudio");
    if (turbo) return turbo as NativeStudio;
  } catch {
    // Fall through to the legacy registry.
  }
  const legacy = (NativeModules as Record<string, unknown>).DHBStudio;
  return legacy ? (legacy as NativeStudio) : null;
}

let cached: NativeStudio | null | undefined;
function studio(): NativeStudio | null {
  if (cached === undefined) cached = resolveModule();
  return cached;
}

/** Test seam: forget the resolved module so the next call looks again. */
export function __resetPhoneStudioForTests(module?: NativeStudio | null): void {
  cached = module === undefined ? undefined : module;
}

function constants(): { version: number; segmentation: boolean } {
  const m = studio();
  if (!m) return { version: 0, segmentation: false };
  let raw: { version?: number; segmentation?: boolean } = {};
  try {
    raw = typeof m.getConstants === "function" ? m.getConstants() ?? {} : m;
  } catch {
    raw = {};
  }
  return { version: Number(raw.version) || 0, segmentation: raw.segmentation === true };
}

/** Whether this binary has the studio at all. */
export function phoneStudioSupported(): boolean {
  return constants().version >= 1;
}

/** Whether background removal can run (iOS 15+, any Android build with the studio). */
export function backgroundRemovalSupported(): boolean {
  const c = constants();
  return c.version >= 1 && c.segmentation;
}

async function call<T>(run: (m: NativeStudio) => Promise<T>, fallback: T): Promise<T> {
  const m = studio();
  if (!m) return fallback;
  return run(m);
}

export function setBackground(mode: BackgroundMode, color?: string | null, imagePath?: string | null): Promise<void> {
  return call((m) => m.setBackground(mode, color ?? null, imagePath ?? null), undefined);
}

/** A full-frame RGBA PNG composited over every frame, or null to clear it. */
export function setOverlay(pngPath: string | null): Promise<void> {
  return call((m) => m.setOverlay(pngPath), undefined);
}

/**
 * An opaque full-frame PNG that replaces the picture, or null for the camera.
 * `fade` crossfades from what is on screen (~300ms); a countdown re-render of
 * the same scene passes false.
 */
export function setCard(pngPath: string | null, options: { fade?: boolean } = {}): Promise<void> {
  return call((m) => m.setCard(pngPath, options.fade !== false), undefined);
}

/** The upright size of the frames being processed, once the camera has sent one. */
export async function getFrameSize(): Promise<FrameSize | null> {
  try {
    const size = await call((m) => m.getFrameSize(), null);
    return size && size.width > 0 && size.height > 0 ? { width: size.width, height: size.height } : null;
  } catch {
    return null;
  }
}

/** Everything off. Called when the producer closes, so nothing outlives the broadcast. */
export function resetStudio(): Promise<void> {
  return call((m) => m.reset(), undefined);
}
