/**
 * Delete now, commit later.
 *
 * A swipe is too easy to trigger to be final on its own, and a confirm dialog
 * after every swipe undoes the point of swiping. So the row goes at once, an
 * Undo sits in the toast for a few seconds, and only then does the real delete
 * run. Same behaviour as dehubweb's src/lib/undoable-delete.ts.
 *
 * Pending ids live at module level rather than in the screen's state, so
 * leaving the screen inside the window neither loses the delete nor brings the
 * row back on the way in.
 */
import { useSyncExternalStore } from "react";

export const UNDO_WINDOW_MS = 5000;

const pending = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = new Set();

function publish() {
  snapshot = new Set(pending.keys());
  listeners.forEach((listener) => listener());
}

/** Hide `id` now and run `commit` once the undo window closes. */
export function scheduleDelete(id: string, commit: () => void, delayMs = UNDO_WINDOW_MS) {
  const existing = pending.get(id);
  if (existing) clearTimeout(existing);
  pending.set(
    id,
    setTimeout(() => {
      pending.delete(id);
      publish();
      commit();
    }, delayMs),
  );
  publish();
}

/** Put `id` back. A no-op once the delete has been committed. */
export function undoDelete(id: string) {
  const timer = pending.get(id);
  if (!timer) return;
  clearTimeout(timer);
  pending.delete(id);
  publish();
}

/** Ids hidden while their undo window is open. */
export function usePendingDeletes(): ReadonlySet<string> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => snapshot,
  );
}
