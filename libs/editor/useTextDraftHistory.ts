import { useRef, useState } from "react";

type History = { scope: string; value: string; past: string[]; future: string[]; at: number; direction: number };
const limit = (entries: string[]) => {
  let size = 0;
  return entries.slice(-100).reverse().filter(value => (size += value.length) <= 1_000_000).reverse();
};

/** Small, local undo history for a text draft before it becomes one document edit. */
export function useTextDraftHistory(scope: string, value: string, write: (value: string) => void) {
  const history = useRef<History>({ scope, value, past: [], future: [], at: 0, direction: 0 });
  const [, refresh] = useState(0);
  if (history.current.scope !== scope || history.current.value !== value) {
    history.current = { scope, value, past: [], future: [], at: 0, direction: 0 };
  }
  const apply = (next: History) => { history.current = next; write(next.value); refresh(version => version + 1); };
  const change = (next: string) => {
    const before = history.current;
    if (next === before.value) return;
    const at = Date.now(), delta = next.length - before.value.length, direction = Math.sign(delta);
    const grouped = direction !== 0 && direction === before.direction && Math.abs(delta) === 1 && at - before.at < 750 && before.future.length === 0
      && next.split("\n").length === before.value.split("\n").length;
    apply({ ...before, value: next, past: grouped ? before.past : limit([...before.past, before.value]), future: [], at, direction: Math.abs(delta) === 1 ? direction : 0 });
  };
  const undo = () => {
    const before = history.current, previous = before.past.at(-1);
    if (previous === undefined) return;
    apply({ ...before, value: previous, past: before.past.slice(0, -1), future: limit([...before.future, before.value]), at: 0, direction: 0 });
  };
  const redo = () => {
    const before = history.current, next = before.future.at(-1);
    if (next === undefined) return;
    apply({ ...before, value: next, past: limit([...before.past, before.value]), future: before.future.slice(0, -1), at: 0, direction: 0 });
  };
  return { change, undo, redo, canUndo: history.current.past.length > 0, canRedo: history.current.future.length > 0 };
}
