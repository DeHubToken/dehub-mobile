import { useEffect, useRef } from 'react';
import type { VideoPlayer } from 'expo-video';

/** Keep one player per cell and cancel preloading of quickly passed pages. */
export function useSettledVideoSource(
  player: Pick<VideoPlayer, 'replaceAsync'>,
  source: string | null,
  active: boolean,
  onReady: () => void,
) {
  const loaded = useRef<string | null>(null);
  const latest = useRef({ source, active, onReady });
  latest.current = { source, active, onReady };
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (loaded.current === source) return;
    const load = () => {
      loaded.current = source;
      player.replaceAsync(source).then(() => {
        if (mounted.current && source && latest.current.source === source && latest.current.active) {
          latest.current.onReady();
        }
      }).catch(() => {
        if (loaded.current === source) loaded.current = null;
      });
    };
    if (!source || active) { load(); return; }
    const timer = setTimeout(load, 400);
    return () => clearTimeout(timer);
  }, [player, source, active]);
}
