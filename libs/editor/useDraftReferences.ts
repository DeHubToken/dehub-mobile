import { useCallback, useRef } from 'react';

export interface DraftReferenceAdoption { id: string; modified: boolean }

/** Rehydrate an untouched saved draft once, while preserving explicit reference edits. */
export function useDraftReferences(state: DraftReferenceAdoption | null, setState: (update: (previous: DraftReferenceAdoption | null) => DraftReferenceAdoption | null) => void, scope: string) {
  const adopted = useRef<string | null>(null);
  const adopt = (id: string | undefined, consumed: boolean): boolean => {
    if (!id) return !consumed;
    const key = `${scope}:${id}`;
    if (adopted.current === key) return false;
    adopted.current = key;
    if (consumed && state?.id === id && state.modified) return false;
    setState(() => ({ id, modified: false }));
    return true;
  };
  const modified = useCallback(() => setState(previous => previous ? { ...previous, modified: true } : previous), [setState]);
  return { adopt, modified };
}
