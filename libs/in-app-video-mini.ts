import type { VideoPlayer } from 'expo-video';
import type { UnifiedFeedItem } from '../services/feed.unified.service';
import { claimPostMedia, type PostMediaSession } from './post-media-session';
import { setInAppVideoPlayer } from './pictureInPicture';

export type MiniRect = { x: number; y: number; width: number; height: number };
export interface InAppVideoMini {
  player: VideoPlayer;
  session: PostMediaSession<VideoPlayer>;
  url: string;
  item: UnifiedFeedItem;
  thumbnail?: string;
  restoreParams?: {
    initialIndex: number; initialItems: UnifiedFeedItem[]; initialPage: number;
    initialThumbnail?: string; feedParams: Record<string, any>;
  };
  initialRect: MiniRect;
  token: object;
  release: () => void;
  restoring: boolean;
  onReady?: () => void;
  onCancel?: () => void;
}
let current: InAppVideoMini | null = null;
let version = 0;
const listeners = new Set<() => void>();
const notify = () => { version++; listeners.forEach(listener => listener()); };
export const getInAppMiniVersion = () => version;
export const getInAppVideoMini = () => current;
export const subscribeInAppVideoMini = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const isInAppVideoPlayer = (player: unknown) => !!player && current?.player === player;

/** Take a lease on the existing decoder before its route gives up ownership. */
export function openInAppVideoMini(input: Omit<InAppVideoMini, 'token' | 'release' | 'restoring'>) {
  if (!input.url || input.session.value !== input.player) return false;
  closeInAppVideoMini();
  const token = {};
  const release = claimPostMedia(`video:${input.url}`, input.session, token, true);
  current = { ...input, token, release, restoring: false };
  setInAppVideoPlayer(input.player);
  notify();
  return true;
}

export function inAppMiniReady(entry: InAppVideoMini) {
  if (current !== entry) return;
  const callback = entry.onReady;
  entry.onReady = undefined;
  entry.onCancel = undefined;
  callback?.();
}

export function restoreInAppVideoMini(entry: InAppVideoMini) {
  if (current !== entry || entry.restoring || entry.onReady) return false;
  entry.restoring = true;
  notify();
  return true;
}

/** The replacement route has drawn its first frame on the same decoder. */
export function finishInAppMiniRestore(player: VideoPlayer) {
  const entry = current;
  if (!entry || !entry.restoring || entry.player !== player) return;
  current = null;
  setInAppVideoPlayer(null);
  entry.release();
  notify();
}

export function closeInAppVideoMini() {
  const entry = current;
  if (!entry) return;
  current = null;
  setInAppVideoPlayer(null);
  const others = entry.session.claims.some(token => token !== entry.token);
  if (others && !entry.onReady && !entry.session.userPaused) {
    // A feed card still shows this clip and takes the decoder back: it plays
    // on silently there, like any feed video, instead of freezing on a frame.
    try { entry.player.muted = true; } catch {}
  } else {
    entry.session.userPaused = true;
    // The final lease already pauses on release; a pending handoff's source
    // route needs an explicit pause because releasing one of several claims
    // does not do that.
    if (others) {
      try { entry.player.pause(); } catch {}
    }
  }
  entry.release();
  entry.onCancel?.();
  notify();
}

/** A root surface that never draws returns to the still-mounted watch route. */
export function cancelInAppMiniHandoff(entry: InAppVideoMini) {
  if (current !== entry || !entry.onReady) return;
  current = null;
  setInAppVideoPlayer(null);
  entry.release();
  entry.onCancel?.();
  notify();
}
