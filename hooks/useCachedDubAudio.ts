import { useEffect, useRef } from 'react';
import { createAudioPlayer } from 'expo-audio';
import type { VideoPlayer } from 'expo-video';
import { getVolume, useMediaVolume } from '../libs/video-preferences';
import { applyVideoVolume, dubVoiceVolume, setDubMixActive, useDubMix } from '../libs/dub-mix';

const owners = new WeakSet<VideoPlayer>();

export function useCachedDubAudio(player: VideoPlayer | null, url: string | null, onFailed: () => void) {
  const master = useMediaVolume();
  const mix = useDubMix();
  const failed = useRef(onFailed);
  failed.current = onFailed;
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    if (!player || !url || owners.has(player)) return;
    owners.add(player);
    const audio = createAudioPlayer({ uri: url }, { updateInterval: 250 });
    let alive = true;
    let seeking = false;
    let broken = false;
    const restore = () => {
      setDubMixActive(player, false);
      try { applyVideoVolume(player, getVolume()); } catch {}
    };
    const fail = () => {
      if (!alive || broken) return;
      broken = true;
      audio.pause();
      restore();
      failed.current();
    };
    const sync = () => {
      if (!alive || broken || !audio.isLoaded) return;
      try {
        audio.volume = player.muted ? 0 : dubVoiceVolume(getVolume());
        if (audio.playbackRate !== player.playbackRate) audio.setPlaybackRate(player.playbackRate);
        setDubMixActive(player, true);
        applyVideoVolume(player, getVolume());
        const shouldPlay = player.playing && !player.muted && getVolume() > 0 && player.status === 'readyToPlay';
        if (!shouldPlay) audio.pause();
        if (seeking) return;
        if (Math.abs(audio.currentTime - player.currentTime) > 0.3) {
          seeking = true;
          audio.pause();
          void audio.seekTo(player.currentTime).then(() => {
            seeking = false;
            if (alive && !broken && player.playing && !player.muted && getVolume() > 0 && player.status === 'readyToPlay') audio.play();
          }).catch(fail);
        } else if (shouldPlay && !audio.playing) audio.play();
      } catch { fail(); }
    };
    const loadTimeout = setTimeout(() => { if (!audio.isLoaded) fail(); }, 30000);
    const subs = [
      player.addListener('timeUpdate', sync), player.addListener('playingChange', sync),
      player.addListener('mutedChange', sync), player.addListener('volumeChange', sync),
      player.addListener('playbackRateChange', sync), player.addListener('statusChange', sync),
      player.addListener('playToEnd', () => audio.pause()),
      audio.addListener('playbackStatusUpdate', sync),
    ];
    refresh.current = sync;
    sync();
    return () => {
      alive = false;
      clearTimeout(loadTimeout);
      refresh.current = () => {};
      subs.forEach((sub) => sub.remove());
      audio.pause();
      audio.remove();
      owners.delete(player);
      restore();
    };
  }, [player, url]);
  useEffect(() => { refresh.current(); }, [master, mix]);
}
