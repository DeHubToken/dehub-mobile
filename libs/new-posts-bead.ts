import { useSyncExternalStore } from "react";
import type { NewPostAuthor } from "../hooks/useNewPostsSignal";

/** What the active feed wants its "new posts" bead to show. HomeScreen draws
 *  the bead itself, above the header, so it can cover the pill's bottom rim
 *  and join it as one shape; a feed list sits under the header and can't. */
export type NewPostsBeadState = {
  count: number;
  authors: NewPostAuthor[];
  label: string;
  onPress: () => void;
};

let owner: symbol | null = null;
let state: NewPostsBeadState | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };

export function setNewPostsBead(id: symbol, next: NewPostsBeadState | null) {
  if (!next && owner !== id) return;
  owner = next ? id : null;
  state = next;
  listeners.forEach(fn => fn());
}

export const useNewPostsBead = () => useSyncExternalStore(subscribe, () => state, () => null);
