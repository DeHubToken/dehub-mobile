import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { VideoPlayer } from 'expo-video';
import { createPlaybackRecovery, playbackSourceIdentity, type PlaybackPhase } from '../libs/playback-recovery';
import { replaceVideoSource } from '../libs/video-source';
import { rewindFinishedVideo } from '../libs/video-start';

/**
 * Feed and Shorts players start with `waitsToMinimizeStalling: false` so the
 * first frame shows without AVPlayer's pre-roll. With that off, AVPlayer's
 * stall behaviour is the legacy one: when the buffer runs dry it drops the
 * rate to 0 and never resumes on its own. JS then sees a pause while the item
 * is still readyToPlay, takes it for a deliberate one, and the clip stays
 * frozen. Once playback has started, hand stalls back to AVPlayer, which waits
 * for data and carries on.
 */
const waitingThroughStalls = new WeakSet<VideoPlayer>();
function waitThroughStallsOnceStarted(player: VideoPlayer) {
  if (Platform.OS !== 'ios' || waitingThroughStalls.has(player)) return;
  waitingThroughStalls.add(player);
  try {
    const current = player.bufferOptions;
    if (current && current.waitsToMinimizeStalling === false) player.bufferOptions = { ...current, waitsToMinimizeStalling: true };
  } catch {}
}

export function usePlaybackRecovery(player: VideoPlayer, source: string | null | undefined, options: {
  component: string;
  postId?: string | number | null;
  allowed: () => boolean;
}) {
  const latest = useRef(options);
  latest.current = options;
  const [phase, setPhase] = useState<PlaybackPhase>('idle');
  const recovery = useMemo(() => createPlaybackRecovery({
    allowed: () => !!source && latest.current.allowed(),
    play: async (reload, allowed) => {
      const position = player.currentTime;
      if (reload || player.status === 'error') {
        await replaceVideoSource(player, source!);
        if (!allowed()) return;
        if (position > 0 && Number.isFinite(player.duration) && position < player.duration) player.currentTime = position;
      }
      if (allowed()) {
        rewindFinishedVideo(player);
        player.play();
      }
    },
    pause: () => { try { player.pause(); } catch {} },
    changed: setPhase,
    report: (event, detail) => {
      require('../libs/errorReporter').reportError(latest.current.component, [`playback ${event}`], {
        level: event === 'failed' ? 'error' : 'info',
        metadata: { ...detail, postId: latest.current.postId, source: playbackSourceIdentity(source ?? ''), status: player.status },
      });
    },
  }), [player, source]);
  useEffect(() => {
    setPhase('idle');
    // Reads on a player released between closing and reopening a viewer throw;
    // treat it as a player that is not playing.
    const read = <T,>(get: () => T, fallback: T): T => { try { return get(); } catch { return fallback; } };
    let previousTime = read(() => player.currentTime, 0);
    const subs = [
      player.addListener('statusChange', ({ status, error }) => {
        if (status === 'error') {
          const code = error?.message?.match(/(?:response code|status code):?\s*(\d{3})/i)?.[1];
          recovery.fail(code ? `http-${code}` : 'source-error');
        }
        if (status === 'loading') recovery.waiting();
      }),
      player.addListener('playingChange', ({ isPlaying }) => {
        if (isPlaying) { waitThroughStallsOnceStarted(player); recovery.watch(); }
        else if (read(() => player.status, 'idle') === 'readyToPlay' && !recovery.replacing && recovery.wanted) recovery.stop();
      }),
      player.addListener('timeUpdate', ({ currentTime }) => {
        if (read(() => player.playing, false) && currentTime !== previousTime) recovery.progress();
        previousTime = currentTime;
      }),
    ];
    if (read(() => player.playing, false)) { recovery.watch(); recovery.progress(); }
    return () => { subs.forEach(sub => sub.remove()); recovery.stop(); };
  }, [player, recovery]);
  return { recovery, phase };
}
