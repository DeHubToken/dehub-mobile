import React, { useRef, useState, useEffect, useCallback } from "react";
import { View, Pressable } from "react-native";
import { VideoView, useVideoPlayer, VideoPlayer } from "expo-video";
import { useNavigation } from "@react-navigation/native";
// Registry no longer enforced for single active; previews self-manage.
import { clearActivePreview } from "../../libs/previewRegistry";

interface VideoPreviewProps {
  previewUrl: string;
  onStart?: () => void;
  onEnd?: () => void;
  handlePressVideo?: () => void;
}

const PREVIEW_SECONDS = 10; // clamp preview length

export default function VideoPreview({
  previewUrl,
  onStart,
  onEnd,
  handlePressVideo,
}: VideoPreviewProps) {
  const viewRef = useRef<VideoView | null>(null);
  const [phase, setPhase] = useState<"idle" | "buffering" | "playing">("idle");
  const [progress, setProgress] = useState(0); // real buffering progress
  const [fakeProgress, setFakeProgress] = useState(0); // synthetic progress up to threshold
  const [effectivePreview, setEffectivePreview] = useState(
    PREVIEW_SECONDS * 1000
  ); // ms
  const navigation = useNavigation<any>();
  const rootRef = useRef<View | null>(null);
  const stopperRef = useRef<(() => void) | undefined>(undefined);

  // Create a player without auto-play; we'll manually control
  const player: VideoPlayer = useVideoPlayer(previewUrl ?? null, (p) => {
    p.loop = false;
    p.muted = true;
    p.playbackRate = 2.5;
    p.timeUpdateEventInterval = 0.2;
  });

  // Subscribe to events
  useEffect(() => {
    const subs = [
      player.addListener("sourceLoad", ({ duration }) => {
        const durationMs = Math.floor((duration ?? 0) * 1000) || PREVIEW_SECONDS * 1000;
        const previewMs = Math.min(PREVIEW_SECONDS * 1000, durationMs);
        setEffectivePreview(previewMs);
      }),
      player.addListener("timeUpdate", ({ currentTime, bufferedPosition }) => {
        if (phase === "buffering") {
          const playableMs = Math.max(0, Math.floor((bufferedPosition ?? 0) * 1000));
          const p = Math.min(1, effectivePreview ? playableMs / effectivePreview : 0);
          setProgress(p);
          if (p >= 1) {
            player.currentTime = 0;
            player.play();
            setPhase("playing");
            onStart?.();
          }
        }
        if (phase === "playing") {
          const posMs = Math.floor((currentTime ?? 0) * 1000);
          if (posMs >= effectivePreview) {
            player.currentTime = 0;
            player.play();
          }
        }
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [player, phase, effectivePreview, onStart]);

  // Derived effects are handled in the listener above

  const stopPreview = useCallback(
    async (invokeEnd: boolean = true) => {
      if (phase === "idle") return;
      try {
        player.pause();
        player.currentTime = 0;
      } catch {}
      setPhase("idle");
      setProgress(0);
      if (invokeEnd) onEnd?.();
    },
    [phase, onEnd, player]
  );

  const startPreview = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("buffering");
    setProgress(0);
    setFakeProgress(0);
    stopperRef.current = () => stopPreview();
    player.muted = true;
    player.playbackRate = 2.5;
    player.pause();
    player.currentTime = 0;
  }, [phase, stopPreview, player]);

  const handlePress = useCallback(() => {
    if (phase === "playing" || phase === "buffering") {
      stopPreview();
    }
    if (handlePressVideo) handlePressVideo();
  }, [phase, stopPreview]);

  useEffect(() => {
    const handleBlur = () => {
      if (phase !== "idle") {
        stopPreview();
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
      unsubBlur && unsubBlur();
      unsubBeforeRemove && unsubBeforeRemove();
    };
  }, [navigation, phase, stopPreview]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stopperRef.current) clearActivePreview(stopperRef.current);
      stopPreview(false);
    };
  }, []);

  // Fake buffering to 25% over ~1.5s unless real progress overtakes
  const FAKE_MAX = 0.25;
  const FAKE_DURATION = 1500; // ms
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
    let frame: number;
    const step = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(1, elapsed / FAKE_DURATION);
      const target = pct * FAKE_MAX;
      setFakeProgress((prev) => (target > prev ? target : prev));
      if (pct < 1 && progress < FAKE_MAX && phase === "buffering") {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [phase, progress, fakeProgress]);

  const displayProgress =
    progress >= FAKE_MAX ? progress : Math.min(FAKE_MAX, fakeProgress);

  return (
    <Pressable
      onLongPress={startPreview}
      delayLongPress={250}
      onPress={handlePress}
      ref={rootRef as any}
      style={{ width: "100%", height: "100%" }}
    >
      {(phase === "buffering" || phase === "playing") && (
        <>
          <VideoView
            ref={(r) => (viewRef.current = r)}
            player={player}
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
                  backgroundColor: "#ff0000",
                }}
              />
            </View>
          )}
        </>
      )}
    </Pressable>
  );
}
