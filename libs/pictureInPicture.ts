import type { VideoPlayer } from 'expo-video';

let activePlayer: VideoPlayer | null = null;
const listeners = new Set<() => void>();
const pendingRelease = new Map<VideoPlayer, Set<() => void>>();

export const subscribePictureInPicture = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getPictureInPicturePlayer = () => activePlayer;
export const isPictureInPicturePlayer = (player: unknown) => !!player && player === activePlayer;

export function setPictureInPicturePlayer(player: VideoPlayer | null): void {
  if (activePlayer === player) return;
  const previous = activePlayer;
  activePlayer = player;
  listeners.forEach(listener => listener());
  if (previous) {
    const releases = pendingRelease.get(previous);
    pendingRelease.delete(previous);
    releases?.forEach(release => release());
  }
}

/** Navigation can release its claim; the OS PiP window still owns the player. */
export function releaseAfterPictureInPicture(player: VideoPlayer, release: () => void): void {
  if (!isPictureInPicturePlayer(player)) { release(); return; }
  let releases = pendingRelease.get(player);
  if (!releases) { releases = new Set(); pendingRelease.set(player, releases); }
  releases.add(release);
}

export function canStartVideo(player: unknown): boolean {
  return !activePlayer || player === activePlayer;
}
