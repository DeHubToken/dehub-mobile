/** A decoded frame must match the requested source time before drawing. */
export interface VideoFrameSource {
  currentTime: number;
  duration: number;
  readyState: number;
  seeking: boolean;
  error?: { code?: number } | null;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}
export interface VideoFrameWaitOptions {
  signal?: AbortSignal;
  cancelled?: () => boolean;
  timeoutMs?: number;
}

export function waitForVideoFrame(source: VideoFrameSource, time: number, options: VideoFrameWaitOptions = {}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let done = false;
    let requested = false;
    let target = Math.max(0, time);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    const events = ["loadedmetadata", "loadeddata", "canplay", "seeked", "timeupdate"];
    function finish(error?: Error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      for (const event of events) source.removeEventListener(event, check);
      source.removeEventListener("error", failed);
      options.signal?.removeEventListener("abort", aborted);
      if (error) reject(error); else resolve();
    }
    function aborted() { const error = new Error("Export cancelled"); error.name = "AbortError"; finish(error); }
    function failed() {
      finish(new Error("Video frame failed to decode" + (source.error?.code ? " (media error " + source.error.code + ")" : "")));
    }
    function check() {
      if (done) return;
      if (options.signal?.aborted || options.cancelled?.()) { aborted(); return; }
      if (source.error) { failed(); return; }
      if (!requested && source.readyState >= 1) {
        requested = true;
        target = Math.max(0, Math.min(Number.isFinite(source.duration) ? Math.max(0, source.duration - 0.001) : time, time));
        if (Math.abs(source.currentTime - target) >= 0.0005) {
          try { source.currentTime = target; } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); return; }
        }
      }
      if (requested && !source.seeking && source.readyState >= 2 && Math.abs(source.currentTime - target) < 0.0005) finish();
    }
    if (!Number.isFinite(time)) { finish(new Error("Invalid video frame time")); return; }
    timer = setTimeout(() => {
      check();
      if (!done) finish(new Error("Video frame did not load at " + target.toFixed(3) + "s (current " + source.currentTime.toFixed(3) + "s, ready " + source.readyState + ", seeking " + source.seeking + ")"));
    }, options.timeoutMs ?? 10000);
    for (const event of events) source.addEventListener(event, check);
    source.addEventListener("error", failed);
    options.signal?.addEventListener("abort", aborted, { once: true });
    // Some paused decoders reach the requested frame without another seek event.
    poll = setInterval(check, 32);
    check();
  });
}

/** The same frame wait for the native canvas page. */
export const VIDEO_FRAME_RUNTIME = `function waitForVideoFrame(source, time, options = {}) {
  return new Promise((resolve, reject) => {
    let done = false;
    let requested = false;
    let target = Math.max(0, time);
    let timer;
    let poll;
    const events = ["loadedmetadata", "loadeddata", "canplay", "seeked", "timeupdate"];
    function finish(error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      for (const event of events) source.removeEventListener(event, check);
      source.removeEventListener("error", failed);
      options.signal?.removeEventListener("abort", aborted);
      if (error) reject(error); else resolve();
    }
    function aborted() { const error = new Error("Export cancelled"); error.name = "AbortError"; finish(error); }
    function failed() {
      finish(new Error("Video frame failed to decode" + (source.error?.code ? " (media error " + source.error.code + ")" : "")));
    }
    function check() {
      if (done) return;
      if (options.signal?.aborted || options.cancelled?.()) { aborted(); return; }
      if (source.error) { failed(); return; }
      if (!requested && source.readyState >= 1) {
        requested = true;
        target = Math.max(0, Math.min(Number.isFinite(source.duration) ? Math.max(0, source.duration - 0.001) : time, time));
        if (Math.abs(source.currentTime - target) >= 0.0005) {
          try { source.currentTime = target; } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); return; }
        }
      }
      if (requested && !source.seeking && source.readyState >= 2 && Math.abs(source.currentTime - target) < 0.0005) finish();
    }
    if (!Number.isFinite(time)) { finish(new Error("Invalid video frame time")); return; }
    timer = setTimeout(() => {
      check();
      if (!done) finish(new Error("Video frame did not load at " + target.toFixed(3) + "s (current " + source.currentTime.toFixed(3) + "s, ready " + source.readyState + ", seeking " + source.seeking + ")"));
    }, options.timeoutMs ?? 10000);
    for (const event of events) source.addEventListener(event, check);
    source.addEventListener("error", failed);
    options.signal?.addEventListener("abort", aborted, { once: true });
    // Some paused decoders reach the requested frame without another seek event.
    poll = setInterval(check, 32);
    check();
  });
}`;
