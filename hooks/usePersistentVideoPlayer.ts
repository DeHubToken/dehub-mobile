import { useEffect, useMemo } from 'react';
import { createVideoPlayer, type VideoPlayer, type VideoSource } from 'expo-video';
import { releaseAfterPictureInPicture } from '../libs/pictureInPicture';

/** A route may unmount while the root PiP view is still using this instance. */
export function usePersistentVideoPlayer(source: VideoSource, setup?: (player: VideoPlayer) => void): VideoPlayer {
  const player = useMemo(() => {
    const value = createVideoPlayer(source);
    setup?.(value);
    return value;
    // Match expo-video: setup runs once per source, not per callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(source)]);
  useEffect(() => () => releaseAfterPictureInPicture(player, () => {
    try { player.timeUpdateEventInterval = 0; player.pause(); player.release(); } catch {}
  }), [player]);
  return player;
}
