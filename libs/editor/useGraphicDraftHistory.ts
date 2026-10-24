import { useRef, useState } from "react";

type History = { scope: string; present: string; past: string[]; future: string[] };
const bounded = (entries: string[]): string[] => {
  let size = 0;
  return entries.slice(-80).reverse().filter(entry => (size += entry.length) <= 1_000_000).reverse();
};

/** Captures complete local graphic drafts, including cell structure and appearance. */
export function useGraphicDraftHistory<T>(scope: string, value: T, restore: (value: T) => void) {
  const serialized = JSON.stringify(value);
  const history = useRef<History>({ scope, present: serialized, past: [], future: [] });
  const [, refresh] = useState(0);
  if (history.current.scope !== scope) history.current = { scope, present: serialized, past: [], future: [] };
  else if (history.current.present !== serialized) {
    history.current = { ...history.current, present: serialized, past: bounded([...history.current.past, history.current.present]), future: [] };
  }
  const undo = () => {
    const before = history.current, previous = before.past.at(-1);
    if (previous === undefined) return;
    history.current = { ...before, present: previous, past: before.past.slice(0, -1), future: bounded([...before.future, before.present]) };
    restore(JSON.parse(previous) as T); refresh(version => version + 1);
  };
  const redo = () => {
    const before = history.current, next = before.future.at(-1);
    if (next === undefined) return;
    history.current = { ...before, present: next, past: bounded([...before.past, before.present]), future: before.future.slice(0, -1) };
    restore(JSON.parse(next) as T); refresh(version => version + 1);
  };
  return { undo, redo, canUndo: history.current.past.length > 0, canRedo: history.current.future.length > 0 };
}
