import { useEffect, useRef } from 'react';
import type { VideoPlayer } from 'expo-video';
import { replaceVideoSource } from '../libs/video-source';

/**
 * How long a neighbour waits after the pager lands before it loads. The pager
 * only lands once per swipe, so this just skips a short flicked straight past;
 * at 400ms a fast flicker reached the next short before it had started loading.
 */
export const NEIGHBOUR_LOAD_DELAY_MS = 120;

/** Keep one player per cell and cancel preloading of quickly passed pages. */
export function useSettledVideoSource(
  player: Pick<VideoPlayer, 'replaceAsync'>,
  source: string | null,
  active: boolean,
  onReady: () => void,
  onError?: () => void,
  sharedSource?: { loadedSource?: string | null },
) {
  const loaded = useRef<string | null>(sharedSource?.loadedSource ?? null);
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
      if (sharedSource) sharedSource.loadedSource = source;
      replaceVideoSource(player, source).then(() => {
        if (mounted.current && source && latest.current.source === source && latest.current.active) {
          latest.current.onReady();
        }
      }).catch(() => {
        if (loaded.current === source) loaded.current = null;
        if (sharedSource?.loadedSource === source) sharedSource.loadedSource = null;
        if (mounted.current && latest.current.source === source && latest.current.active) latest.current.onError?.();
      });
    };
    if (!source || active) { load(); return; }
    const timer = setTimeout(load, NEIGHBOUR_LOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [player, source, active]);
}
