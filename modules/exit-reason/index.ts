import { Platform } from "react-native";

/** One historical process exit, as Android reports it (API 30+). */
export interface ProcessExitInfo {
  /** ApplicationExitInfo.REASON_* code. */
  reason: number;
  /** The REASON_* constant's name, e.g. "CRASH_NATIVE", "LOW_MEMORY", "ANR". */
  reasonName: string;
  description: string | null;
  /** Epoch millis of the exit. */
  timestamp: number;
  importance: number;
  /** Memory at the time, in kB. */
  pss: number;
  rss: number;
  status: number;
  /** Head of the tombstone, for native crashes and ANRs only. */
  trace: string | null;
}

/**
 * The last few exits of this process, newest first. Empty on iOS, on Android
 * below 11, in Expo Go, and under a test runner — never a throw.
 */
export function getLastExitReasons(max = 8): ProcessExitInfo[] {
  if (Platform.OS !== "android") return [];
  try {
    // Required lazily: the native module only exists in a build that compiled
    // it, and the reporter has to keep working everywhere else.
    const { requireNativeModule } = require("expo-modules-core") as {
      requireNativeModule: (name: string) => { getLastExitReasons: (max: number) => ProcessExitInfo[] };
    };
    const native = requireNativeModule("ExitReason");
    const list = native.getLastExitReasons(max);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * The Java stack of the last uncaught exception, written by the module's
 * crash handler on the way down. Read once; the file is deleted. Null when
 * there was none, and everywhere the module does not exist.
 */
export function takeLastJavaCrash(): string | null {
  if (Platform.OS !== "android") return null;
  try {
    const { requireNativeModule } = require("expo-modules-core") as {
      requireNativeModule: (name: string) => { takeLastJavaCrash: () => string | null };
    };
    const text = requireNativeModule("ExitReason").takeLastJavaCrash();
    return typeof text === "string" && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
