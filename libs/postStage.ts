import { useSyncExternalStore } from "react";

/**
 * What the post page's pinned mini player needs to know about the post it
 * sits over. The card fills in what the post is (thumbnail, title, creator
 * line, the like) and the player on the page fills in whether it is playing,
 * how far along it is and how to toggle it. Keyed on the post, so a second
 * post page pushed on top keeps its own.
 */
export type PostStageMedia = {
  thumb?: string;
  title?: string;
  subtitle?: string;
  /** Video, audio or live: the strip carries a play/pause button. */
  playable?: boolean;
  playing?: boolean;
  /** 0..1 */
  progress?: number;
  toggle?: () => void;
  liked?: boolean;
  like?: () => void;
};

const EMPTY: PostStageMedia = Object.freeze({}) as PostStageMedia;
const states = new Map<string, PostStageMedia>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

/** Merge fields into a post's entry. Unchanged values notify nobody. */
export function patchPostStage(tokenId: string | number | null | undefined, patch: Partial<PostStageMedia>) {
  if (tokenId == null) return;
  const key = String(tokenId);
  const prev = states.get(key) ?? EMPTY;
  let changed = false;
  for (const k of Object.keys(patch) as (keyof PostStageMedia)[]) {
    if (prev[k] !== patch[k]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  states.set(key, { ...prev, ...patch });
  notify(key);
}

/** Forget a post's entry, when the page that owned it goes away. */
export function clearPostStage(tokenId: string | number | null | undefined) {
  if (tokenId == null) return;
  const key = String(tokenId);
  if (!states.delete(key)) return;
  notify(key);
}

export function getPostStage(tokenId: string | number | null | undefined): PostStageMedia {
  if (tokenId == null) return EMPTY;
  return states.get(String(tokenId)) ?? EMPTY;
}

export function usePostStage(tokenId: string | number | null | undefined): PostStageMedia {
  const key = tokenId == null ? "" : String(tokenId);
  return useSyncExternalStore(
    (cb) => {
      if (!key) return () => {};
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(cb);
      return () => {
        set!.delete(cb);
        if (!set!.size) listeners.delete(key);
      };
    },
    () => (key ? states.get(key) ?? EMPTY : EMPTY),
    () => EMPTY,
  );
}
