import * as Crypto from "expo-crypto";
import type { ScreenRecordingDriver, ScreenRecordingResult } from "../../libs/editor/screenCaptureOwnership";

export type CaptureCapabilities = { available: boolean; systemAudio: boolean; microphone: boolean; background: boolean };
export type CaptureState = Partial<ScreenRecordingResult> & { sessionId: string; scopeKey: string; playheadMs: number; state: string };
type NativeCapture = {
  capabilities: () => CaptureCapabilities | Promise<CaptureCapabilities>;
  start: (id: string, scope: string, playheadMs: number, microphone: boolean, systemAudio: boolean, title: string, save: string, cancel: string) => Promise<void>;
  finish: (id: string) => Promise<ScreenRecordingResult & { scopeKey: string; playheadMs: number }>;
  cancel: (id: string) => Promise<void>;
  status: (id: string) => CaptureState | null | Promise<CaptureState | null>;
  recover: (scope: string) => CaptureState[] | Promise<CaptureState[]>;
  acknowledge: (id: string) => void | Promise<void>;
  addListener: (event: string, changed: (state: CaptureState) => void) => { remove: () => void };
};

function nativeCapture(): NativeCapture | null {
  try {
    const { requireNativeModule } = require("expo-modules-core") as { requireNativeModule: (name: string) => NativeCapture };
    return requireNativeModule("DeHubScreenCapture");
  } catch { return null; }
}
export async function captureScopeKey(scope: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, scope);
}
export async function screenCaptureCapabilities(): Promise<CaptureCapabilities> {
  const unavailable = { available: false, systemAudio: false, microphone: false, background: false };
  try { return await nativeCapture()?.capabilities() ?? unavailable; } catch { return unavailable; }
}
export async function recoverScreenCaptures(scope: string): Promise<CaptureState[]> {
  const capture = nativeCapture(); if (!capture) return [];
  const key = await captureScopeKey(scope);
  return (await capture.recover(key)).filter(value => value.scopeKey === key && value.state === "completed" && Number.isFinite(value.playheadMs) && value.playheadMs >= 0);
}

/** One bridge binds native completion, including process recovery, to its original scope. */
export function screenCaptureDriver(options: { scope: string; playhead: number; systemAudio: boolean; title: string; save: string; cancel: string }, recovered?: CaptureState) {
  const capture = nativeCapture();
  if (!capture) throw new Error("System screen recording is unavailable");
  const key = captureScopeKey(options.scope);
  const cancelled = new Set<string>();
  const started = new Set<string>();
  const playheadMs = options.playhead * 1000;
  const driver: ScreenRecordingDriver = {
    start: async ({ sessionId, microphone }) => {
      const scope = await key;
      if (cancelled.has(sessionId)) throw new Error("Screen recording was cancelled");
      started.add(sessionId);
      if (recovered) {
        if (recovered.sessionId !== sessionId || recovered.scopeKey !== scope || recovered.playheadMs !== playheadMs || recovered.state !== "completed") throw new Error("Screen recording belongs to a different project");
        return;
      }
      await capture.start(sessionId, scope, playheadMs, microphone, options.systemAudio, options.title, options.save, options.cancel);
    },
    cancel: async id => {
      cancelled.add(id);
      if (started.has(id)) await capture.cancel(id);
    },
    finish: async id => {
      const value = await capture.finish(id);
      if (cancelled.has(id) || value.scopeKey !== await key || value.playheadMs !== playheadMs) {
        await capture.cancel(id); throw new Error("Screen recording returned to a different project");
      }
      return value;
    },
  };
  return {
    driver,
    acknowledge: (id: string) => capture.acknowledge(id),
    status: async (id: string) => {
      const value = await capture.status(id);
      return value?.scopeKey === await key && value.playheadMs === playheadMs ? value : null;
    },
    subscribe: (id: string, changed: (state: CaptureState) => void) => capture.addListener("screenRecordingState", value => {
      if (value.sessionId === id) void key.then(scope => {
        if (!cancelled.has(id) && value.scopeKey === scope && value.playheadMs === playheadMs) changed(value);
      });
    }),
    saveRecovered: async (state: CaptureState) => {
      if (state.scopeKey !== await key || state.playheadMs !== playheadMs) throw new Error("Screen recording belongs to a different project");
      started.add(state.sessionId);
      return driver.finish(state.sessionId);
    },
  };
}
