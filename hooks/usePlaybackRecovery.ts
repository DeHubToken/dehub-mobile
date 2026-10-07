import { useEffect, useMemo, useRef, useState } from 'react';
import type { VideoPlayer } from 'expo-video';
import { createPlaybackRecovery, playbackSourceIdentity, type PlaybackPhase } from '../libs/playback-recovery';
import { replaceVideoSource } from '../libs/video-source';

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
      if (allowed()) player.play();
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
    let previousTime = player.currentTime;
    const subs = [
      player.addListener('statusChange', ({ status, error }) => {
        if (status === 'error') {
          const code = error?.message?.match(/(?:response code|status code):?\s*(\d{3})/i)?.[1];
          recovery.fail(code ? `http-${code}` : 'source-error');
        }
        if (status === 'loading') recovery.waiting();
      }),
      player.addListener('playingChange', ({ isPlaying }) => {
        if (isPlaying) recovery.watch();
        else if (player.status === 'readyToPlay' && !recovery.replacing && recovery.wanted) recovery.stop();
      }),
      player.addListener('timeUpdate', ({ currentTime }) => {
        if (player.playing && currentTime !== previousTime) recovery.progress();
        previousTime = currentTime;
      }),
    ];
    if (player.playing) { recovery.watch(); recovery.progress(); }
    return () => { subs.forEach(sub => sub.remove()); recovery.stop(); };
  }, [player, recovery]);
  return { recovery, phase };
}
