import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, TouchableOpacity, Text, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer, type VideoPlayer } from 'expo-video';
import { FULLSCREEN_BUFFER_OPTIONS } from "../../libs/videoBuffering";
import * as ScreenOrientation from 'expo-screen-orientation';
import Slider from '@react-native-community/slider';

export type FullScreenVideoPlayerProps = {
  visible: boolean;
  uri: string | null | undefined;
  onClose: () => void;
};

const FullScreenVideoPlayer: React.FC<FullScreenVideoPlayerProps> = ({ visible, uri, onClose }) => {
  const insets = useSafeAreaInsets();
  const sourceUrl = useMemo(() => (uri ? String(uri) : null), [uri]);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [position, setPosition] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isLandscape, setIsLandscape] = useState<boolean>(false);
  const seekingRef = useRef<boolean>(false);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const player: VideoPlayer = useVideoPlayer(sourceUrl ?? null, (p) => {
    p.loop = true;
    p.muted = false;
    p.timeUpdateEventInterval = 0.5; // ensure frequent progress updates
    p.bufferOptions = FULLSCREEN_BUFFER_OPTIONS;
    // do not auto-play here; wait for sourceLoad
  });

  const unlockOrientation = useCallback(async () => {
    try { await ScreenOrientation.unlockAsync(); } catch {}
  }, []);

  // On visible toggle: reset UI state and force a fresh session key
  useEffect(() => {
    if (visible) {
      setSessionKey(`${Date.now()}-${sourceUrl || 'novid'}`);
      setPosition(0);
      setDuration(0);
      setIsPlaying(true);
    } else {
      try { player.pause(); } catch {}
      setIsPlaying(false);
      setIsLandscape(false);
      ScreenOrientation.unlockAsync().catch(() => {});
  try { player.replace(null as any); } catch {}
    }
    return () => {
      // Ensure orientation is unlocked on unmount
      ScreenOrientation.unlockAsync().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Replace source whenever URI changes (ensures fresh load even for same URI across opens)
  useEffect(() => {
    if (!sourceUrl) return;
    try { player.replace(sourceUrl); } catch {}
    return () => {
      try { player.pause(); } catch {}
  try { player.replace(null as any); } catch {}
    };
  }, [sourceUrl, player]);

  // Subscribe to player events and reflect into local state
  useEffect(() => {
    const subs = [
      player.addListener('playingChange', ({ isPlaying }) => {
        setIsPlaying(Boolean(isPlaying));
      }),
      player.addListener('sourceLoad', ({ duration: durSec }) => {
        const durMs = Math.max(0, Math.floor((durSec ?? 0) * 1000));
        setDuration(durMs);
        if (visible) {
          try { player.play(); } catch {}
        }
      }),
      player.addListener('timeUpdate', ({ currentTime }) => {
        if (seekingRef.current) return;
        const curMs = Math.max(0, Math.floor((currentTime ?? 0) * 1000));
        setPosition(curMs);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [player, visible]);

  // Pause when app is backgrounded
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        try { player.pause(); } catch {}
      }
    });
    return () => { try { sub.remove(); } catch {} };
  }, [player]);

  const handleClose = useCallback(async () => {
    try { player.pause(); } catch {}
    await unlockOrientation();
    onClose();
  }, [onClose, unlockOrientation, player]);

  const handlePlayPause = useCallback(async () => {
    try {
      if (player.playing) {
        player.pause();
        setIsPlaying(false);
      } else {
        player.play();
        setIsPlaying(true);
      }
    } catch {}
  }, [player]);

  const handleRotate = useCallback(async () => {
    try {
      if (isLandscape) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        setIsLandscape(false);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT);
        setIsLandscape(true);
      }
    } catch {}
  }, [isLandscape]);

  const handleSlidingStart = useCallback(() => {
    seekingRef.current = true;
  }, []);

  const handleSlidingComplete = useCallback(async (value: number) => {
    seekingRef.current = false;
    setPosition(value);
    try { player.currentTime = Math.floor(value) / 1000; } catch {}
  }, [player]);

  const formatTime = useCallback((ms: number) => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={handleClose}>
      <View className="flex-1 bg-black">
        {/* Close button */}
        <View className="absolute left-4 z-50" style={{ top: insets.top + 8 }}>
          <TouchableOpacity
            onPress={handleClose}
            className="bg-zinc-900/60 p-2.5 rounded-xl"
            accessibilityLabel="Close video"
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Video Area */}
        {visible && sourceUrl ? (
          <VideoView
            key={sessionKey || undefined}
            player={player}
            style={{ flex: 1, backgroundColor: 'black' }}
            contentFit="contain"
            nativeControls={false}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-white">No video</Text>
          </View>
        )}

        {/* Controls */}
        <View className="absolute left-0 right-0 bottom-0 pb-6 pt-3 px-4">
          <View className="bg-black/50 rounded-xl px-3 py-2">
            <View className="flex-row items-center gap-3">
              <Text className="text-white text-xs w-10 text-center">{formatTime(position)}</Text>
              <Slider
                style={{ flex: 1, height: 28 }}
                minimumValue={0}
                maximumValue={Math.max(duration, 1)}
                value={Math.min(position, duration)}
                onSlidingStart={handleSlidingStart}
                onSlidingComplete={handleSlidingComplete}
                minimumTrackTintColor="#FFFFFF"
                maximumTrackTintColor="#8B8D90"
                thumbTintColor="#FFFFFF"
                disabled={!sourceUrl}
              />
              <Text className="text-white text-xs w-10 text-center">{formatTime(duration)}</Text>
            </View>
            <View className="flex-row items-center justify-between mt-2">
              <View className="w-10" />
              <TouchableOpacity
                onPress={handlePlayPause}
                className="self-center bg-white/15 p-3 rounded-2xl"
                activeOpacity={0.9}
                accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
              >
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRotate}
                className="self-center bg-white/15 p-2.5 rounded-xl"
                activeOpacity={0.9}
                accessibilityLabel="Rotate"
              >
                <Ionicons name={'refresh'} size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default FullScreenVideoPlayer;
