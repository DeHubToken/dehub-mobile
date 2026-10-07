/**
 * Dubbed audio for a video post: whether it is on, and in which language.
 *
 * The dub used to be a server render — a `video_dubs` row filled by a GPU
 * worker that was never deployed, so every request sat at 'pending' and the
 * captions sheet said "Preparing…" for as long as anyone looked. It is now
 * spoken on the device from the translated transcript (see useVoiceDub), so
 * there is no job to create and nothing to wait on beyond the translation the
 * captions already use.
 *
 * The switch lives in two places — the Audio row in the captions sheet and
 * the Dub row in the post's "…" menu — so it is one store both read, rather
 * than a copy each that drifts the moment the other one is pressed.
 */
import { useSyncExternalStore } from "react";
import { storage } from "../libs/storage";
import { supabase } from "../services/supabase";
import { queryClient } from "../config/queryClient";
import { transcriptKey, type TranscriptRecord } from "./useTranscript";
import { findVoice } from "./useVoiceDub";
import { createLogger } from "../libs/logger";
import { autoTranslateEnabled, subscribeAutoTranslate } from "../libs/auto-translate-setting";

const logger = createLogger("useVideoDub");

// New keys on purpose: anyone who switched the server dub on under the old
// key never heard anything, and should not be surprised by a voice now.
const ON_KEY = "video-voice-dub-on";
const LANG_KEY = "video-voice-dub-lang";

export interface DubSettings {
  on: boolean;
  automatic?: boolean;
  /** What to speak in. Null means the app's language. */
  lang: string | null;
}

function read(): DubSettings {
  try {
    const saved = storage.getString(ON_KEY);
    return { on: saved !== "false", automatic: saved == null, lang: storage.getString(LANG_KEY) || null };
  } catch {
    return { on: true, automatic: true, lang: null };
  }
}

let current: DubSettings = read();
const listeners = new Set<() => void>();

export function getDubSettings(): DubSettings {
  const on = current.automatic ? autoTranslateEnabled() : current.on;
  if (on !== current.on) current = { ...current, on };
  return current;
}

export function setDubSettings(next: Partial<DubSettings>): void {
  current = { ...current, ...next };
  if (next.on !== undefined) current.automatic = false;
  try {
    if (!current.automatic) storage.set(ON_KEY, String(current.on));
    if (current.lang) storage.set(LANG_KEY, current.lang);
    else storage.delete(LANG_KEY);
  } catch {}
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const unsubscribeAuto = subscribeAutoTranslate(listener);
  return () => {
    listeners.delete(listener);
    unsubscribeAuto();
  };
}

export function useDubSettings(): DubSettings {
  return useSyncExternalStore(subscribe, getDubSettings);
}

export type DubCheck = "ok" | "no-transcript" | "no-voice";

/**
 * Whether a video can be dubbed into `lang` right now: it needs a finished
 * transcript to translate, and the device needs a voice for the language.
 * Reads the transcript the captions may already have cached before asking.
 */
export async function checkDubbable(
  tokenId: number | string | null | undefined,
  lang: string,
): Promise<DubCheck> {
  const n = typeof tokenId === "string" ? parseInt(tokenId, 10) : tokenId ?? 0;
  if (!Number.isFinite(n) || !n || n <= 0) return "no-transcript";
  const ref = String(n);

  let status = queryClient.getQueryData<TranscriptRecord | null>(transcriptKey("video", ref))?.status;
  if (status !== "ready") {
    try {
      const { data } = await supabase
        .from("transcripts")
        .select("status")
        .eq("source_kind", "video")
        .eq("source_ref", ref)
        .maybeSingle();
      status = (data as { status?: TranscriptRecord["status"] } | null)?.status;
    } catch (e) {
      logger.warn("could not read transcript status", e);
    }
  }
  if (status !== "ready") return "no-transcript";

  const voice = await findVoice(lang);
  return voice === null ? "no-voice" : "ok";
}
