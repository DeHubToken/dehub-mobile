import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createVideoPlayer, type VideoPlayer } from 'expo-video';
import { claimPostMedia, ownsPostMedia, postMediaSession } from '../libs/post-media-session';
import { replaceVideoSource } from '../libs/video-source';
import { shareAudioWhenSilent } from '../libs/videoAudioMixing';

export function usePostVideoPlayer(url: string | null | undefined, setup: (player: VideoPlayer) => void, deferSource = false, priority = false) {
  const token = useRef({}).current;
  const privateKey = useRef(`empty:${Math.random()}`).current;
  const key = url ? `video:${url}` : privateKey;
  const session = useMemo(() => postMediaSession<VideoPlayer>(key, player => {
    try { player.timeUpdateEventInterval = 0; player.pause(); player.release(); } catch {}
  }), [key]);
  if (!session.value) {
    session.loadedSource = deferSource ? null : url || null;
    session.value = createVideoPlayer(session.loadedSource);
    shareAudioWhenSilent(session.value);
    setup(session.value);
  }
  const [, refresh] = useState(0);
  useLayoutEffect(() => {
    const notify = () => refresh(version => version + 1);
    session.listeners.add(notify);
    const release = claimPostMedia(key, session, token, priority);
    return () => { session.listeners.delete(notify); release(); };
  }, [key, session, token, priority]);
  const ownsPlayer = useCallback(() => ownsPostMedia(session, token), [session, token]);
  const active = ownsPlayer();
  useEffect(() => {
    if (deferSource || !ownsPlayer() || session.loadedSource === (url || null)) return;
    session.loadedSource = url || null;
    void replaceVideoSource(session.value!, url || null).catch(() => { session.loadedSource = null; });
  }, [deferSource, url, session, ownsPlayer, active]);
  return { player: session.value, session, ownsPlayer, active };
}
