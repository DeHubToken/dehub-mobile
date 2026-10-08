/** A decoded frame must match the requested source time before drawing. */
export interface VideoFrameSource {
  currentTime: number;
  duration: number;
  readyState: number;
  seeking: boolean;
  load?: () => void;
  requestVideoFrameCallback?(callback: () => void): number;
  cancelVideoFrameCallback?(handle: number): void;
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
    let recovery: ReturnType<typeof setTimeout> | undefined;
    let needsPresentation = source.seeking || source.readyState < 2;
    let presentationStarted = false;
    let presented = false;
    let generation = 0;
    let animation: number | undefined;
    let videoCallback: number | undefined;
    const events = ["loadedmetadata", "loadeddata", "canplay", "seeked", "timeupdate"];
    function clearPresentation() {
      generation++;
      if (animation !== undefined && typeof cancelAnimationFrame === "function") cancelAnimationFrame(animation);
      if (videoCallback !== undefined) source.cancelVideoFrameCallback?.(videoCallback);
      animation = undefined;
      videoCallback = undefined;
      presentationStarted = false;
      presented = false;
    }
    function decoded() {
      return requested && !source.seeking && source.readyState >= 2 && Math.abs(source.currentTime - target) < 0.0005;
    }
    function presentation() {
      if (presentationStarted) return;
      // Seeking can finish before the paused frame reaches the drawing surface.
      // A video callback acknowledges a new frame. Two redraws also handle
      // repeated seeks within the same source frame, which need no new callback.
      if (typeof requestAnimationFrame !== "function") { finish(); return; }
      presentationStarted = true;
      const expectedGeneration = generation;
      function ready() {
        if (done || generation !== expectedGeneration) return;
        if (!decoded()) { clearPresentation(); return; }
        presented = true;
        check();
      }
      try { videoCallback = source.requestVideoFrameCallback?.(ready); } catch { /* Redraw fallback for older engines. */ }
      animation = requestAnimationFrame(() => {
        animation = undefined;
        if (done || generation !== expectedGeneration) return;
        if (!decoded()) { clearPresentation(); return; }
        animation = requestAnimationFrame(ready);
      });
    }
    function finish(error?: Error) {
      if (done) return;
      done = true;
      clearPresentation();
      clearTimeout(timer);
      clearInterval(poll);
      clearTimeout(recovery);
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
          needsPresentation = true;
          try { source.currentTime = target; } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); return; }
        }
      }
      if (!decoded()) { if (presentationStarted) clearPresentation(); return; }
      if (!needsPresentation || presented) finish(); else presentation();
    }
    function recover() {
      check();
      if (done || !requested || !source.seeking || !source.load) return;
      // Restart a stalled decoder once, then require the same exact source frame.
      requested = false;
      needsPresentation = true;
      clearPresentation();
      try { source.load(); } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); return; }
      check();
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
    recovery = setTimeout(recover, 2500);
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
    let recovery;
    let needsPresentation = source.seeking || source.readyState < 2;
    let presentationStarted = false;
    let presented = false;
    let generation = 0;
    let animation;
    let videoCallback;
    const events = ["loadedmetadata", "loadeddata", "canplay", "seeked", "timeupdate"];
    function clearPresentation() {
      generation++;
      if (animation !== undefined && typeof cancelAnimationFrame === "function") cancelAnimationFrame(animation);
      if (videoCallback !== undefined) source.cancelVideoFrameCallback?.(videoCallback);
      animation = undefined;
      videoCallback = undefined;
      presentationStarted = false;
      presented = false;
    }
    function decoded() {
      return requested && !source.seeking && source.readyState >= 2 && Math.abs(source.currentTime - target) < 0.0005;
    }
    function presentation() {
      if (presentationStarted) return;
      // Seeking can finish before the paused frame reaches the drawing surface.
      // A video callback acknowledges a new frame. Two redraws also handle
      // repeated seeks within the same source frame, which need no new callback.
      if (typeof requestAnimationFrame !== "function") { finish(); return; }
      presentationStarted = true;
      const expectedGeneration = generation;
      function ready() {
        if (done || generation !== expectedGeneration) return;
        if (!decoded()) { clearPresentation(); return; }
        presented = true;
        check();
      }
      try { videoCallback = source.requestVideoFrameCallback?.(ready); } catch { /* Redraw fallback for older engines. */ }
      animation = requestAnimationFrame(() => {
        animation = undefined;
        if (done || generation !== expectedGeneration) return;
        if (!decoded()) { clearPresentation(); return; }
        animation = requestAnimationFrame(ready);
      });
    }
    function finish(error) {
      if (done) return;
      done = true;
      clearPresentation();
      clearTimeout(timer);
      clearInterval(poll);
      clearTimeout(recovery);
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
          needsPresentation = true;
          try { source.currentTime = target; } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); return; }
        }
      }
      if (!decoded()) { if (presentationStarted) clearPresentation(); return; }
      if (!needsPresentation || presented) finish(); else presentation();
    }
    function recover() {
      check();
      if (done || !requested || !source.seeking || !source.load) return;
      // Restart a stalled decoder once, then require the same exact source frame.
      requested = false;
      needsPresentation = true;
      clearPresentation();
      try { source.load(); } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); return; }
      check();
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
    recovery = setTimeout(recover, 2500);
    check();
  });
}`;
