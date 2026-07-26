import { useEffect, useCallback } from "react";
import { useAudioPlayer } from "expo-audio";
import type { VideoPlayer } from "expo-video";

interface UseSyncedAudioOptions {
  soundtrackUrl?: string;
  isPlaying: boolean;
  player: VideoPlayer | null;
}

export function useSyncedAudio({
  soundtrackUrl,
  isPlaying,
  player,
}: UseSyncedAudioOptions) {
  // Migrated from expo-av (removed in SDK 55). useAudioPlayer loads the source
  // and releases the native player on unmount, so the manual load/unload
  // effect this hook used to carry is gone.
  const audio = useAudioPlayer(soundtrackUrl ? { uri: soundtrackUrl } : null);
  const hasSoundtrack = !!soundtrackUrl;

  const stopSoundtrack = useCallback(() => {
    try {
      // expo-audio has no stop(); pause + rewind is the equivalent.
      audio.pause();
      void audio.seekTo(0).catch(() => {});
    } catch {}
  }, [audio]);

  // Sync play/pause with the video
  useEffect(() => {
    if (!hasSoundtrack) return;
    try {
      if (isPlaying) audio.play();
      else audio.pause();
    } catch {}
  }, [isPlaying, hasSoundtrack, audio]);

  // Drift correction against the video clock
  useEffect(() => {
    if (!player || !hasSoundtrack) return;

    const sub = player.addListener("timeUpdate", (evt: { currentTime: number }) => {
      if (!audio.isLoaded) return;
      // Both clocks are in SECONDS now. Under expo-av this had to divide
      // positionMillis by 1000 and multiply the seek back up by 1000; with
      // expo-audio currentTime is already seconds on both sides, so the two
      // conversions cancel out and are simply gone.
      const drift = Math.abs(evt.currentTime - audio.currentTime);
      if (drift > 0.3) {
        void audio.seekTo(evt.currentTime).catch(() => {});
      }
    });

    return () => sub.remove();
  }, [player, hasSoundtrack, audio]);

  // Handle video end
  useEffect(() => {
    if (!player || !hasSoundtrack) return;
    const sub = player.addListener("playToEnd", () => {
      stopSoundtrack();
    });
    return () => sub.remove();
  }, [player, hasSoundtrack, stopSoundtrack]);

  return { hasSoundtrack, stopSoundtrack };
}
