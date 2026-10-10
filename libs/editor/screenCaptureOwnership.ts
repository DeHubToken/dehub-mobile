export type ScreenRecordingOptions = { sessionId: string; microphone: boolean };
export type ScreenRecordingResult = {
  sessionId: string;
  uri: string;
  width: number;
  height: number;
  durationMs: number;
};
export type ScreenRecordingDriver = {
  // Register ownership before opening permission UI; cancel must also invalidate pending consent.
  start: (options: ScreenRecordingOptions) => Promise<void>;
  finish: (sessionId: string) => Promise<ScreenRecordingResult>;
  cancel: (sessionId: string) => Promise<void>;
};

/** A departing editor can only stop its own native take, including pending OS permission. */
export function ownScreenCapture(driver: ScreenRecordingDriver, options: ScreenRecordingOptions, isCurrent: () => boolean) {
  if (!options.sessionId) throw new Error("Screen recording requires a session");
  const sessionId = options.sessionId;
  let cancelled = false;
  let cancelling: Promise<void> | null = null;
  let finishing: Promise<ScreenRecordingResult | null> | null = null;
  const cancel = () => {
    cancelled = true;
    cancelling ??= Promise.resolve().then(() => driver.cancel(sessionId));
    return cancelling;
  };
  const current = () => !cancelled && isCurrent();
  const ready = (async () => {
    try {
      await driver.start({ sessionId, microphone: options.microphone });
      if (!current()) { await cancel(); return false; }
      return true;
    } catch (error) {
      await cancel().catch(() => {});
      throw error;
    }
  })();
  const save = () => {
    finishing ??= (async () => {
      if (!await ready) return null;
      if (!current()) { await cancel(); return null; }
      try {
        const result = await driver.finish(sessionId);
        if (!current()) { await cancel(); return null; }
        if (result.sessionId !== sessionId || !/^file:\/\/\/.+\.mp4$/i.test(result.uri)
          || !Number.isFinite(result.width) || result.width <= 0
          || !Number.isFinite(result.height) || result.height <= 0
          || !Number.isFinite(result.durationMs) || result.durationMs < 250) {
          await cancel(); return null;
        }
        return result;
      } catch (error) {
        await cancel().catch(() => {});
        throw error;
      }
    })();
    return finishing;
  };
  return { ready, save, cancel };
}
