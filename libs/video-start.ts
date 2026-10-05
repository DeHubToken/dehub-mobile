import type { VideoPlayer } from 'expo-video';

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
