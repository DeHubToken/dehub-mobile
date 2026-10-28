import type { VideoPlayer, VideoSource } from 'expo-video';

const pending = new WeakMap<object, Promise<void>>();

/** Source changes share a queue so a slow neighbour cannot overwrite a newer item. */
export function replaceVideoSource(player: Pick<VideoPlayer, 'replaceAsync'>, source: VideoSource): Promise<void> {
  const previous = pending.get(player);
  // A released player (the viewer closed and reopened on a pooled cell) throws
  // synchronously; keep that a rejection so the caller's catch handles it
  // instead of it escaping an effect and crashing the screen.
  const replace = () => {
    try { return player.replaceAsync(source); } catch (error) { return Promise.reject(error); }
  };
  const next = previous ? previous.catch(() => {}).then(replace) : replace();
  pending.set(player, next);
  void next.finally(() => { if (pending.get(player) === next) pending.delete(player); }).catch(() => {});
  return next;
}
