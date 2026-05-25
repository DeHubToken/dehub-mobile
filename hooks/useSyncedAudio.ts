import { useEffect, useRef, useCallback } from "react";
import { Audio, type AVPlaybackSource } from "expo-av";
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
  const soundRef = useRef<Audio.Sound | null>(null);
  const hasSoundtrack = !!soundtrackUrl;

  // Load/unload sound
  useEffect(() => {
    if (!soundtrackUrl) return;
    let cancelled = false;

    (async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: soundtrackUrl } as AVPlaybackSource,
          { shouldPlay: false, isLooping: false },
        );
        if (cancelled) {
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;
      } catch (e) {
        console.error("[useSyncedAudio] Failed to load soundtrack:", e);
      }
    })();

    return () => {
      cancelled = true;
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, [soundtrackUrl]);

  // Sync play/pause
  useEffect(() => {
    const sound = soundRef.current;
    if (!sound || !hasSoundtrack) return;

    if (isPlaying) {
      sound.playAsync().catch(() => {});
    } else {
      sound.pauseAsync().catch(() => {});
    }
  }, [isPlaying, hasSoundtrack]);

  // Sync seek on video seek
  useEffect(() => {
    const sound = soundRef.current;
    if (!sound || !player || !hasSoundtrack) return;

    const sub = player.addListener("timeUpdate", (evt: { currentTime: number }) => {
      if (!soundRef.current || !player) return;
      // Drift correction: if audio drifts > 0.3s, snap it back
      soundRef.current.getStatusAsync().then((status) => {
        if (!status.isLoaded) return;
        const drift = Math.abs(evt.currentTime - (status.positionMillis / 1000));
        if (drift > 0.3) {
          soundRef.current?.setPositionAsync(evt.currentTime * 1000).catch(() => {});
        }
      }).catch(() => {});
    });

    return () => sub.remove();
  }, [player, hasSoundtrack]);

  // Handle video end
  useEffect(() => {
    if (!player || !hasSoundtrack) return;
    const sub = player.addListener("playToEnd", () => {
      soundRef.current?.stopAsync().catch(() => {});
    });
    return () => sub.remove();
  }, [player, hasSoundtrack]);

  const stopSoundtrack = useCallback(() => {
    soundRef.current?.stopAsync().catch(() => {});
  }, []);

  return { hasSoundtrack, stopSoundtrack };
}
