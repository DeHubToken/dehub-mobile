import type { VideoPlayer } from 'expo-video';

/** A finished shared player needs a seek before ExoPlayer can play it again. */
export function rewindFinishedVideo(player: Pick<VideoPlayer, 'playing' | 'duration' | 'currentTime'>): void {
  if (!player.playing && Number.isFinite(player.duration) && player.duration > 0 && player.currentTime >= player.duration) {
    player.currentTime = 0;
  }
}

/** Keep the request until AVPlayer has an item ready to receive play(). */
export function flushVideoPlayIntent(
  pending: { current: boolean },
  ready: boolean,
  play: () => void,
): void {
  if (!pending.current) return;
  pending.current = !ready;
  play();
}

/** AVPlayer can queue play while loading; waiting for readiness can strand it. */
export function requestVideoPlayback(
  player: Pick<VideoPlayer, 'status' | 'play' | 'replaceAsync'>,
  source: string,
  isAllowed: () => boolean,
): Promise<void> {
  const play = () => { if (isAllowed()) player.play(); };
  if (player.status === 'error') return player.replaceAsync(source).then(play);
  play();
  return Promise.resolve();
}
