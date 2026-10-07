import { Image } from "react-native";
import { createVideoPlayer } from "expo-video";
import { createAudioPlayer } from "expo-audio";
import type { GeneratedMediaKind } from "./generatedMedia";

export function throwIfImportAborted(signal?: AbortSignal): void {
  if (signal?.aborted) { const error = new Error("Import cancelled"); error.name = "AbortError"; throw error; }
}

/** Measure the complete source before creating a timeline clip; never play it. */
export async function probeGeneratedMedia(uri: string, kind: GeneratedMediaKind, signal?: AbortSignal): Promise<{ width: number; height: number; duration?: number }> {
  throwIfImportAborted(signal);
  const video = kind === "video" ? createVideoPlayer(uri) : null;
  const audio = kind === "audio" ? createAudioPlayer({ uri }, { updateInterval: 100 }) : null;
  const subscriptions: { remove(): void }[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    if (video) video.muted = true;
    return await new Promise((resolve, reject) => {
      const fail = () => reject(new Error("Could not read generated media metadata"));
      const measured = (duration?: number, width = 0, height = 0) => {
        const sizeValid = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
        if (kind === "image" ? sizeValid : Number.isFinite(duration) && (duration ?? 0) > 0 && (kind === "audio" || sizeValid)) {
          resolve({ width, height, ...(duration ? { duration } : {}) });
        }
      };
      abort = () => { const error = new Error("Import cancelled"); error.name = "AbortError"; reject(error); };
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(fail, 15000);
      if (signal?.aborted) { abort(); return; }
      if (video) {
        subscriptions.push(video.addListener("sourceLoad", info => {
          const size = info.availableVideoTracks[0]?.size;
          measured(info.duration, size?.width, size?.height);
        }));
        subscriptions.push(video.addListener("statusChange", info => {
          if (info.status === "error") fail();
          else if (info.status === "readyToPlay") {
            const size = video.availableVideoTracks[0]?.size;
            measured(video.duration, size?.width, size?.height);
          }
        }));
        const size = video.availableVideoTracks[0]?.size;
        measured(video.duration, size?.width, size?.height);
      } else if (audio) {
        subscriptions.push(audio.addListener("playbackStatusUpdate", info => { if (info.isLoaded) measured(info.duration); }));
        if (audio.isLoaded) measured(audio.duration);
      } else Image.getSize(uri, (width, height) => measured(undefined, width, height), fail);
    });
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
    subscriptions.forEach(subscription => subscription.remove());
    video?.release();
    audio?.remove();
  }
}
