import React, { useRef, useState, useEffect, useCallback } from "react";
import { View, Pressable } from "react-native";
import { VideoView, useVideoPlayer, VideoPlayer } from "expo-video";
import { useNavigation } from "@react-navigation/native";
import {
  registerActivePreview,
  clearActivePreview,
  stopActivePreview,
  ensurePreviewNavigationGuards,
} from "../../libs/previewRegistry";
import { revokeAudioFocus } from "../../libs/audioFocus";

interface VideoPreviewProps {
  previewUrl: string;
  onStart?: () => void;
  onEnd?: () => void;
  handlePressVideo?: () => void;
}

const PREVIEW_SECONDS = 10; // clamp preview length
const FAKE_MAX = 0.25;
const FAKE_DURATION = 1500;

export default function VideoPreview({
  previewUrl,
  onStart,
  onEnd,
  handlePressVideo,
}: VideoPreviewProps) {
  const viewRef = useRef<VideoView | null>(null);

  // phases: idle -> buffering -> playing
  const [phase, setPhase] = useState<"idle" | "buffering" | "playing">("idle");
  const [mounted, setMounted] = useState(false);
  const [progress, setProgress] = useState(0); // real buffer progress (0..1)
  const [fakeProgress, setFakeProgress] = useState(0); // synthetic progress (0..FAKE_MAX)
  const [effectivePreview, setEffectivePreview] = useState(
    PREVIEW_SECONDS * 1000
  ); // ms

  const playerRef = useRef<VideoPlayer | null>(null); // keep latest player object
  // @ts-ignore
  const stopperRef = useRef<() => void>(); // stable stopper function registered globally
  const loopCountRef = useRef<number>(0);
  const navigation = useNavigation<any>();

  // Create a player only when mounted; keep it assigned to playerRef
  const player: VideoPlayer | null = useVideoPlayer(
    mounted ? previewUrl ?? null : null,
    (p) => {
      p.loop = false;
      p.muted = true;
      p.playbackRate = 2.5;
      p.timeUpdateEventInterval = 0.3;
    }
  );

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  // a stable stop implementation that always consults playerRef.current
  const runStopPreview = useCallback(
    async (invokeEnd: boolean = true) => {
      // If already idle just ensure unmounted and registry cleared
      try {
        // Ensure we unregister ourselves from global registry if we're the active stopper
        if (stopperRef.current) {
          try {
            clearActivePreview(stopperRef.current);
          } catch {}
        }

        const p = playerRef.current;
        // Defensive: pause / reset time / attempt to unload if available
        try {
          if (p?.pause) await p.pause();
        } catch {}
        try {
          if (p) (p as any).currentTime = 0;
        } catch {}
        // Some implementations expose unload API — call if present
        try {
          if (typeof (p as any)?.unloadAsync === "function") {
            await (p as any).unloadAsync();
          }
        } catch {}
      } catch (e) {
        // ignore errors during stop
      } finally {
        setPhase("idle");
        setProgress(0);
        setFakeProgress(0);
        setMounted(false);
        loopCountRef.current = 0;
        if (invokeEnd) onEnd?.();
      }
    },
    [onEnd]
  );

  // keep stopperRef assigned to a stable wrapper that always calls runStopPreview
  useEffect(() => {
    stopperRef.current = () => runStopPreview();
    // When unmounting clear registry if we registered
    return () => {
      if (stopperRef.current) {
        try {
          clearActivePreview(stopperRef.current);
        } catch {}
      }
    };
  }, [runStopPreview]);

  // Listeners for player events
  useEffect(() => {
    if (!player) return;
    const subs: Array<{ remove: () => void } | { remove?: () => void }> = [];

    // sourceLoad -> determine preview length (cap to PREVIEW_SECONDS)
    try {
      subs.push(
        player.addListener("sourceLoad", ({ duration }: any) => {
          const durationMs =
            Math.floor((duration ?? 0) * 1000) || PREVIEW_SECONDS * 1000;
          const previewMs = Math.min(PREVIEW_SECONDS * 1000, durationMs);
          setEffectivePreview(previewMs);
        })
      );
    } catch {}

    // timeUpdate -> buffer & playback handling
    try {
      subs.push(
        player.addListener(
          "timeUpdate",
          ({ currentTime, bufferedPosition }: any) => {
            // Buffering: check if enough buffered
            if (phase === "buffering") {
              const playableMs = Math.max(
                0,
                Math.floor((bufferedPosition ?? 0) * 1000)
              );
              const p = Math.min(
                1,
                effectivePreview ? playableMs / effectivePreview : 0
              );
              setProgress(p);
              if (p >= 1) {
                // enough buffered -> start playing from 0
                try {
                  if (playerRef.current)
                    (playerRef.current as any).currentTime = 0;
                  if (playerRef.current && playerRef.current.play)
                    playerRef.current.play();
                } catch {}
                setPhase("playing");
                onStart?.();
              }
            }

            // Playing: check preview expiration and loop logic
            if (phase === "playing") {
              const posMs = Math.floor((currentTime ?? 0) * 1000);
              if (posMs >= effectivePreview) {
                if (loopCountRef.current < 2) {
                  loopCountRef.current += 1;
                  try {
                    if (playerRef.current)
                      (playerRef.current as any).currentTime = 0;
                    if (playerRef.current && playerRef.current.play)
                      playerRef.current.play();
                  } catch {}
                } else {
                  // final end -> stop preview (defer to avoid reentry)
                  setTimeout(() => {
                    try {
                      if (playerRef.current && playerRef.current.pause)
                        playerRef.current.pause();
                    } catch {}
                    runStopPreview();
                  }, 0);
                }
              }
            }
          }
        )
      );
    } catch {}

    return () => {
      subs.forEach((s) => {
        try {
          s.remove && s.remove();
        } catch {}
      });
    };
  }, [player, phase, effectivePreview, onStart, runStopPreview]);

  // Fake progress to give early UI feedback up to FAKE_MAX
  useEffect(() => {
    if (phase !== "buffering") {
      if (fakeProgress !== 0) setFakeProgress(0);
      return;
    }
    if (progress >= FAKE_MAX) {
      if (fakeProgress !== FAKE_MAX) setFakeProgress(FAKE_MAX);
      return;
    }
    const start = Date.now();
    let raf = 0;
    const step = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(1, elapsed / FAKE_DURATION);
      const target = pct * FAKE_MAX;
      setFakeProgress((prev) => (target > prev ? target : prev));
      if (pct < 1 && progress < FAKE_MAX && phase === "buffering") {
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, progress, fakeProgress]);

  const displayProgress =
    progress >= FAKE_MAX ? progress : Math.min(FAKE_MAX, fakeProgress);

  // Start preview: stop any other active preview immediately, register our stopper, mount and begin buffering
  const startPreview = useCallback(async () => {
    if (phase !== "idle") return;
    loopCountRef.current = 0;

    // Stop any active preview immediately (this will call the other instance's registered stopper)
    try {
      stopActivePreview();
    } catch {}

    // Stop any playing audio (global one-at-a-time policy)
    revokeAudioFocus();

    // Register our stopper so future starts will stop us
    if (stopperRef.current) {
      try {
        registerActivePreview(stopperRef.current);
      } catch {}
    }

    setMounted(true);
    setPhase("buffering");
    setProgress(0);
    setFakeProgress(0);

    // If player object is already there adjust props; else the useVideoPlayer hook will create player when mounted -> its listeners handle buffer->play
    try {
      if (playerRef.current) {
        try {
          playerRef.current.muted = true;
        } catch {}
        try {
          (playerRef.current as any).playbackRate = 2.5;
        } catch {}
        try {
          if (playerRef.current.pause) playerRef.current.pause();
        } catch {}
        try {
          (playerRef.current as any).currentTime = 0;
        } catch {}
      }
    } catch {}
  }, [phase]);

  // User tapping the preview: if preview running, stop it, then call external handler
  const handlePress = useCallback(() => {
    if (phase === "playing" || phase === "buffering") {
      runStopPreview();
    }
    if (handlePressVideo) handlePressVideo();
  }, [phase, runStopPreview, handlePressVideo]);

  // Navigation guards: stop preview on blur/beforeRemove/transition
  useEffect(() => {
    ensurePreviewNavigationGuards(navigation);
    const handleBlur = () => {
      if (phase !== "idle") {
        runStopPreview();
      } else {
        setPhase("idle");
      }
    };
    const unsubBlur = navigation.addListener("blur", handleBlur);
    const unsubBeforeRemove = navigation.addListener(
      "beforeRemove",
      handleBlur
    );
    return () => {
      try {
        unsubBlur && unsubBlur();
      } catch {}
      try {
        unsubBeforeRemove && unsubBeforeRemove();
      } catch {}
    };
  }, [navigation, phase, runStopPreview]);

  // Cleanup on unmount: clear registry and stop without invoking onEnd (avoid double-calls)
  useEffect(() => {
    return () => {
      if (stopperRef.current) {
        try {
          clearActivePreview(stopperRef.current);
        } catch {}
      }
      // stop without invoking onEnd (component unmount)
      runStopPreview(false);
    };
  }, [runStopPreview]);

  return (
    <Pressable
      onLongPress={startPreview}
      delayLongPress={250}
      onPress={handlePress}
      style={{ width: "100%", height: "100%" }}
    >
      {mounted && (phase === "buffering" || phase === "playing") && (
        <>
          <VideoView
            ref={(r) => {
              viewRef.current = r as any;
            }}
            player={player as any}
            contentFit="cover"
            nativeControls={false}
            style={{ width: "100%", height: "100%" }}
          />
          {phase === "buffering" && (
            <View
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 3,
                backgroundColor: "rgba(255,255,255,0.3)",
              }}
            >
              <View
                style={{
                  width: `${displayProgress * 100}%`,
                  height: "100%",
                  backgroundColor: "#FFFFFF",
                }}
              />
            </View>
          )}
        </>
      )}
    </Pressable>
  );
}
