import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createVideoPlayer, type VideoPlayer } from 'expo-video';
import { claimPostMedia, ownsPostMedia, postMediaSession } from '../libs/post-media-session';

export function usePostVideoPlayer(url: string | null | undefined, setup: (player: VideoPlayer) => void) {
  const token = useRef({}).current;
  const privateKey = useRef(`empty:${Math.random()}`).current;
  const key = url ? `video:${url}` : privateKey;
  const session = useMemo(() => postMediaSession<VideoPlayer>(key, player => {
    try { player.timeUpdateEventInterval = 0; player.pause(); player.release(); } catch {}
  }), [key]);
  if (!session.value) {
    session.value = createVideoPlayer(url || null);
    setup(session.value);
  }
  const [, refresh] = useState(0);
  useLayoutEffect(() => {
    const notify = () => refresh(version => version + 1);
    session.listeners.add(notify);
    const release = claimPostMedia(key, session, token);
    return () => { session.listeners.delete(notify); release(); };
  }, [key, session, token]);
  const ownsPlayer = useCallback(() => ownsPostMedia(session, token), [session, token]);
  return { player: session.value, session, ownsPlayer, active: ownsPlayer() };
}
