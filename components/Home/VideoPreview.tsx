import React, { useRef, useState, useEffect, useCallback } from "react";
import { View, Pressable } from "react-native";
import { Video, AVPlaybackStatus, ResizeMode } from "expo-av";
import { useNavigation } from "@react-navigation/native";
// Registry no longer enforced for single active; previews self-manage.
import { clearActivePreview } from "../../libs/previewRegistry";

interface VideoPreviewProps {
  previewUrl: string;
  onStart?: () => void;
  onEnd?: () => void;
}

const PREVIEW_SECONDS = 10; // clamp preview length

export default function VideoPreview({
  previewUrl,
  onStart,
  onEnd,
}: VideoPreviewProps) {
  const videoRef = useRef<Video | null>(null);
  const [phase, setPhase] = useState<"idle" | "buffering" | "playing">("idle");
  const [progress, setProgress] = useState(0);
  const [effectivePreview, setEffectivePreview] = useState(
    PREVIEW_SECONDS * 1000
  ); // ms
  const navigation = useNavigation<any>();
  const rootRef = useRef<View | null>(null);
  const stopperRef = useRef<() => void>();

  // handle video status updates
  const onStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;

      const playable = (status as any).playableDurationMillis ?? 0;
      const duration = (status as any).durationMillis ?? PREVIEW_SECONDS * 1000;

      // clamp preview time to duration
      const previewMs = Math.min(PREVIEW_SECONDS * 1000, duration);
      if (previewMs !== effectivePreview) {
        setEffectivePreview(previewMs);
      }

      if (phase === "buffering") {
        const p = Math.min(1, playable / previewMs);
        setProgress(p);

        if (p >= 1) {
          videoRef.current?.setStatusAsync({
            shouldPlay: true,
            isMuted: true,
            positionMillis: 0,
            rate: 2.5,
            shouldCorrectPitch: false, // needed for faster playback
          });
          setPhase("playing");
          onStart?.();
        }
      }

      if (phase === "playing") {
        const pos = (status as any).positionMillis ?? 0;
        if (pos >= previewMs) {
          videoRef.current?.setStatusAsync({
            positionMillis: 0,
            shouldPlay: true,
            rate: 2.5,
            shouldCorrectPitch: false,
          });
        }
      }
    },
    [phase, onStart, effectivePreview]
  );

  const stopPreview = useCallback(
    async (invokeEnd: boolean = true) => {
      if (phase === "idle") return;
      try {
        await videoRef.current?.stopAsync();
      } catch {}
      setPhase("idle");
      setProgress(0);
      if (invokeEnd) onEnd?.();
    },
    [phase, onEnd]
  );

  const startPreview = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("buffering");
    setProgress(0);
    stopperRef.current = () => stopPreview();
    await videoRef.current?.setStatusAsync({
      shouldPlay: false,
      isMuted: true,
      positionMillis: 0,
      rate: 2.5,
      shouldCorrectPitch: false,
    });
  }, [phase, stopPreview]);

  // Single tap while preview is active stops it
  const handlePress = useCallback(() => {
    if (phase === "playing" || phase === "buffering") {
      stopPreview();
    }
  }, [phase, stopPreview]);

  // Screen/navigation change: force stop this preview
  useEffect(() => {
    const handleBlur = () => {
      // stop this preview if active
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
          <Video
            ref={(r) => (videoRef.current = r)}
            source={{ uri: previewUrl }}
            resizeMode={ResizeMode.COVER}
            shouldPlay={false}
            isLooping={false}
            onPlaybackStatusUpdate={onStatusUpdate}
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
                  width: `${progress * 100}%`,
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
