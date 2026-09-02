/**
 * Dubbed audio for a video post — the mobile twin of dehubweb's
 * `use-video-dub`.
 *
 * A dub is a row in `video_dubs`, one per transcript and language, whose
 * `audio_url` is an AAC track rendered in the speaker's cloned voice. Reading
 * is a row lookup; asking for one calls `auto-dub`, which queues the job. The
 * sweeper fills the common languages ahead of time, so most viewers find the
 * row already ready.
 *
 * `useDubbedAudio` plays the track through expo-audio glued to the expo-video
 * clock, the same way a soundtrack rides a feed card, with the video's own
 * sound turned down while it runs.
 */
import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAudioPlayer } from "expo-audio";
import type { VideoPlayer } from "expo-video";
import { supabase } from "../services/supabase";
import { storage } from "../libs/storage";
import { createLogger } from "../libs/logger";

const logger = createLogger("useVideoDub");

/** Languages the synthesiser speaks. Mirrors `DUB_LANGS` in the function. */
export const DUB_LANGS = [
  "en", "es", "pt", "fr", "de", "it", "pl", "tr", "ru", "nl", "cs", "ar", "zh", "ja", "hu", "ko", "hi",
] as const;

export function dubLangFor(pickerCode: string | null | undefined): string | null {
  const base = (pickerCode ?? "").toLowerCase().split("-")[0];
  return (DUB_LANGS as readonly string[]).includes(base) ? base : null;
}

const DUB_KEY = "video-dubs-on";
export function getDubEnabled(): boolean {
  try { return storage.getString(DUB_KEY) === "true"; } catch { return false; }
}
export function setDubEnabled(on: boolean): void {
  try { storage.set(DUB_KEY, String(on)); } catch {}
}

export type DubStatus = "pending" | "processing" | "ready" | "failed";

export interface DubRecord {
  status: DubStatus;
  audio_url: string | null;
  error: string | null;
  attempts: number;
}

export function useVideoDub(transcriptId: string | null, lang: string | null, enabled: boolean) {
  const qc = useQueryClient();
  const wanted = enabled && !!transcriptId && !!lang;
  const key = ["video-dub", transcriptId, lang] as const;

  const query = useQuery<DubRecord | null>({
    queryKey: key,
    enabled: wanted,
    staleTime: 60 * 60_000,
    refetchInterval: (q) => {
      const s = (q.state.data as DubRecord | null)?.status;
      return s === "pending" || s === "processing" ? 5000 : false;
    },
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("video_dubs")
        .select("status, audio_url, error, attempts")
        .eq("transcript_id", transcriptId!)
        .eq("language", lang!)
        .maybeSingle();
      if (error) throw error;
      return (data as DubRecord | null) ?? null;
    },
  });

  const request = useCallback(async () => {
    if (!wanted) return;
    try {
      await supabase.functions.invoke("auto-dub", {
        body: { action: "request", transcriptId, lang },
      });
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      logger.warn("could not request dub", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, transcriptId, lang, qc]);

  // Ask once per (transcript, language) for a row nobody has rendered yet. A
  // failed row is asked again; the function owns the attempt ceiling.
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!wanted || query.isLoading) return;
    if (query.data && query.data.status !== "failed") return;
    const token = `${transcriptId}:${lang}`;
    if (asked.current === token) return;
    asked.current = token;
    void request();
  }, [wanted, query.isLoading, query.data, transcriptId, lang, request]);

  return { dub: query.data ?? null, isLoading: query.isLoading, request };
}

interface DubbedAudioOptions {
  /** The finished track, or null to play the original. */
  url: string | null;
  player: VideoPlayer | null;
  isPlaying: boolean;
}

/**
 * Play the dub in lockstep with the video.
 *
 * The video's `volume` goes to zero rather than `muted`, so the player's mute
 * button keeps its meaning: `muted` is mirrored onto the track on every tick
 * and `volume` is our own switch, restored on the way out.
 */
export function useDubbedAudio({ url, player, isPlaying }: DubbedAudioOptions) {
  const audio = useAudioPlayer(url ? { uri: url } : null);
  const active = !!url && !!player;

  useEffect(() => {
    if (!active || !player) return;
    let prevVolume = 1;
    try { prevVolume = player.volume; player.volume = 0; } catch {}
    return () => {
      try { player.volume = prevVolume; } catch {}
      try { audio.pause(); } catch {}
    };
  }, [active, player, audio]);

  useEffect(() => {
    if (!active) return;
    try {
      if (isPlaying) audio.play();
      else audio.pause();
    } catch {}
  }, [isPlaying, active, audio]);

  useEffect(() => {
    if (!active || !player) return;
    const sub = player.addListener("timeUpdate", (evt: { currentTime: number }) => {
      if (!audio.isLoaded) return;
      try {
        if (audio.muted !== player.muted) audio.muted = player.muted;
        if (audio.playbackRate !== player.playbackRate) audio.playbackRate = player.playbackRate;
        if (Math.abs(evt.currentTime - audio.currentTime) > 0.3) {
          void audio.seekTo(evt.currentTime).catch(() => {});
        }
      } catch {}
    });
    const end = player.addListener("playToEnd", () => {
      try { audio.pause(); void audio.seekTo(0).catch(() => {}); } catch {}
    });
    return () => { sub.remove(); end.remove(); };
  }, [active, player, audio]);
}
