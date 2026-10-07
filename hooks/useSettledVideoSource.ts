import { useEffect, useRef } from 'react';
import type { VideoPlayer } from 'expo-video';
import { replaceVideoSource } from '../libs/video-source';

/** Keep one player per cell and cancel preloading of quickly passed pages. */
export function useSettledVideoSource(
  player: Pick<VideoPlayer, 'replaceAsync'>,
  source: string | null,
  active: boolean,
  onReady: () => void,
  onError?: () => void,
) {
  const loaded = useRef<string | null>(null);
  const latest = useRef({ source, active, onReady, onError });
  latest.current = { source, active, onReady, onError };
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (loaded.current === source) return;
    const load = () => {
      loaded.current = source;
      replaceVideoSource(player, source).then(() => {
        if (mounted.current && source && latest.current.source === source && latest.current.active) {
          latest.current.onReady();
        }
      }).catch(() => {
        if (loaded.current === source) loaded.current = null;
        if (mounted.current && latest.current.source === source && latest.current.active) latest.current.onError?.();
      });
    };
    if (!source || active) { load(); return; }
    const timer = setTimeout(load, 400);
    return () => clearTimeout(timer);
  }, [player, source, active]);
}
