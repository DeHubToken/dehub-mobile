/**
 * Profile view mode: the All tab shows posts as a grid of tiles or as the
 * full post list. The reader's choice, kept on this device and shared by the
 * toolbar toggle and the tab that draws the posts.
 */
import { useSyncExternalStore } from "react";
import { storage } from "./storage";

export type ProfileViewMode = "grid" | "list";

const KEY = "dehub:profileView";
const listeners = new Set<() => void>();

let current: ProfileViewMode | null = null;

function snapshot(): ProfileViewMode {
  if (current === null) {
    try {
      current = storage.getString(KEY) === "list" ? "list" : "grid";
    } catch {
      current = "grid";
    }
  }
  return current;
}

export function setProfileViewMode(mode: ProfileViewMode): void {
  current = mode;
  try {
    storage.set(KEY, mode);
  } catch {
    /* the choice lasts for this session */
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useProfileViewMode(): ProfileViewMode {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
