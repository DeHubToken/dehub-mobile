import { videoMatteFrame } from "./videoMatte";
import type { Clip } from "./types";
export interface VideoMatteDecodedImage { naturalWidth: number; naturalHeight: number }
export type VideoMatteFrame = NonNullable<ReturnType<typeof videoMatteFrame>>;
/** Only selected pages stay decoded, with one page load in flight across rapid seeks. */

export function createVideoMattePageCache<T extends VideoMatteDecodedImage>(images: Map<string, T>, load: (frame: VideoMatteFrame) => Promise<T>, release: (image: T) => void) {
  let desired = new Map<string, VideoMatteFrame>();
  const owned = new Set<string>();
  let running: Promise<void> | null = null, disposed = false, failure: { id: string; error: unknown } | null = null;
  function evict() {
    owned.forEach(function(id) { if (!desired.has(id)) { var image = images.get(id); if (image) release(image); images.delete(id); owned.delete(id); } });
  }
  async function drain() {
    while (!disposed) {
      evict();
      var next = Array.from(desired.values()).find(function(frame) { return !images.has(frame.mediaId); });
      if (!next) return;
      let image: T | undefined;
      try {
        image = await load(next);
        if (image.naturalWidth !== next.atlasWidth || image.naturalHeight !== next.atlasHeight) throw new Error("Background page dimensions do not match");
      } catch (error) {
        if (image) release(image);
        failure = { id: next.mediaId, error: error }; throw error;
      }
      if (disposed || !desired.has(next.mediaId)) { release(image); continue; }
      images.set(next.mediaId, image); owned.add(next.mediaId);
    }
  }
  function ensure(): Promise<void> {
    if (!running) running = drain().finally(function() { running = null; });
    return running.then(function() {
      if (!disposed && Array.from(desired.values()).some(function(frame) { return !images.has(frame.mediaId); })) return ensure();
    });
  }
  return {
    select: function(frames: VideoMatteFrame[]) {
      if (disposed) return Promise.reject(new Error("Background page cache closed"));
      desired = new Map(frames.map(function(frame) { return [frame.mediaId, frame]; })); evict();
      for (var frame of frames) {
        var image = images.get(frame.mediaId);
        if (image && (image.naturalWidth !== frame.atlasWidth || image.naturalHeight !== frame.atlasHeight)) return Promise.reject(new Error("Background page dimensions do not match"));
      }
      if (failure && desired.has(failure.id)) return Promise.reject(failure.error);
      failure = null;
      return ensure();
    },
    dispose: function() { disposed = true; desired.clear(); evict(); },
  };
}

export function videoMatteFramesForOps(ops: { clip: Clip; localTimeOverride?: number }[], time: number): VideoMatteFrame[] {
  const frames: VideoMatteFrame[] = [];
  for (const op of ops) if (op.clip.kind === "video" && op.clip.videoMatte) {
    const frame = videoMatteFrame(op.clip, op.localTimeOverride ?? op.clip.trimIn + (time - op.clip.start) * (op.clip.speed ?? 1));
    if (!frame) throw new Error("Background-removal frames are missing for this range");
    frames.push(frame);
  }
  return frames;
}

export const VIDEO_MATTE_PAGE_CACHE_RUNTIME = String.raw`
function createVideoMattePageCache(images, load, release) {
  var desired = new Map(), owned = new Set(), running = null, disposed = false, failure = null;
  function evict() {
    owned.forEach(function(id) { if (!desired.has(id)) { var image = images.get(id); if (image) release(image); images.delete(id); owned.delete(id); } });
  }
  async function drain() {
    while (!disposed) {
      evict();
      var next = Array.from(desired.values()).find(function(frame) { return !images.has(frame.mediaId); });
      if (!next) return;
      var image;
      try {
        image = await load(next);
        if (image.naturalWidth !== next.atlasWidth || image.naturalHeight !== next.atlasHeight) throw new Error("Background page dimensions do not match");
      } catch (error) {
        if (image) release(image);
        failure = { id: next.mediaId, error: error }; throw error;
      }
      if (disposed || !desired.has(next.mediaId)) { release(image); continue; }
      images.set(next.mediaId, image); owned.add(next.mediaId);
    }
  }
  function ensure() {
    if (!running) running = drain().finally(function() { running = null; });
    return running.then(function() {
      if (!disposed && Array.from(desired.values()).some(function(frame) { return !images.has(frame.mediaId); })) return ensure();
    });
  }
  return {
    select: function(frames) {
      if (disposed) return Promise.reject(new Error("Background page cache closed"));
      desired = new Map(frames.map(function(frame) { return [frame.mediaId, frame]; })); evict();
      for (var frame of frames) {
        var image = images.get(frame.mediaId);
        if (image && (image.naturalWidth !== frame.atlasWidth || image.naturalHeight !== frame.atlasHeight)) return Promise.reject(new Error("Background page dimensions do not match"));
      }
      if (failure && desired.has(failure.id)) return Promise.reject(failure.error);
      failure = null;
      return ensure();
    },
    dispose: function() { disposed = true; desired.clear(); evict(); },
  };
}
`;
