import type { VideoPlayer, VideoSource } from 'expo-video';

const pending = new WeakMap<object, Promise<void>>();

/** Source changes share a queue so a slow neighbour cannot overwrite a newer item. */
export function replaceVideoSource(player: Pick<VideoPlayer, 'replaceAsync'>, source: VideoSource): Promise<void> {
  const previous = pending.get(player);
  const next = previous
    ? previous.catch(() => {}).then(() => player.replaceAsync(source))
    : player.replaceAsync(source);
  pending.set(player, next);
  void next.finally(() => { if (pending.get(player) === next) pending.delete(player); }).catch(() => {});
  return next;
}
