import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AudioPlayer } from 'expo-audio';
import { claimPostMedia, ownsPostMedia, postMediaSession } from '../libs/post-media-session';

export function usePostAudioSession(url: string) {
  const key = `audio:${url}`;
  const token = useRef({}).current;
  const session = useMemo(() => postMediaSession<AudioPlayer>(key, player => {
    try { player.pause(); player.remove(); } catch {}
  }), [key]);
  const [, refresh] = useState(0);
  useLayoutEffect(() => {
    const notify = () => refresh(version => version + 1);
    session.listeners.add(notify);
    const release = claimPostMedia(key, session, token);
    return () => { session.listeners.delete(notify); release(); };
  }, [key, session, token]);
  const ownsPlayer = () => ownsPostMedia(session, token);
  return { session, ownsPlayer, active: ownsPlayer() };
}
