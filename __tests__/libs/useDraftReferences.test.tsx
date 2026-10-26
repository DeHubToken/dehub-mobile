import { useState } from 'react';
import { act, renderHook } from '@testing-library/react-native';

import { useDraftReferences, type DraftReferenceAdoption } from '../../libs/editor/useDraftReferences';

function useReferenceWorkspace(saved: DraftReferenceAdoption | null, initial: string[] = []) {
  const [state, setState] = useState(saved);
  const [references, setReferences] = useState(initial);
  const adoption = useDraftReferences(state, setState, 'owner:film-shot');
  return { state, references,
    hydrate: (id: string, consumed: boolean, next: string[]) => { if (adoption.adopt(id, consumed)) setReferences(next); },
    edit: (next: string[]) => { setReferences(next); adoption.modified(); },
  };
}

it('rehydrates untouched blob references once and preserves changed or cleared references on reopen and reload', () => {
  const first = renderHook(() => useReferenceWorkspace({ id: 'shot-v1', modified: false }));
  act(() => first.result.current.hydrate('shot-v1', true, ['blob:rehydrated']));
  expect(first.result.current.references).toEqual(['blob:rehydrated']);
  act(() => first.result.current.edit(['blob:chosen-by-user']));
  first.rerender({});
  act(() => first.result.current.hydrate('shot-v1', true, ['blob:original-new-object']));
  expect(first.result.current.references).toEqual(['blob:chosen-by-user']);
  act(() => first.result.current.edit([]));
  const saved = first.result.current.state;
  first.unmount();
  const restored = renderHook(() => useReferenceWorkspace(saved));
  act(() => restored.result.current.hydrate('shot-v1', true, ['blob:original-after-reload']));
  expect(restored.result.current.references).toEqual([]);
  act(() => restored.result.current.hydrate('shot-v2', false, ['blob:explicit-new-draft']));
  expect(restored.result.current.references).toEqual(['blob:explicit-new-draft']);
});
