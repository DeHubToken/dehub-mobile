import { useCallback, useSyncExternalStore } from "react";
import { useAccountDraftKey } from "../../hooks/useDraftState";
import { storage } from "../storage";
import { createEditorLibraryStore, EMPTY_EDITOR_LIBRARY, type EditorLibraryKind } from "./editorLibrary";
const store = createEditorLibraryStore(key => storage.getString(key), (key, value) => storage.set(key, value));
export function useEditorLibrary(kind: EditorLibraryKind) {
  const key = "dehub-editor-library:v1:" + useAccountDraftKey("preferences");
  const state = useSyncExternalStore(store.subscribe, useCallback(() => store.get(key), [key]), () => EMPTY_EDITOR_LIBRARY);
  return { ...state[kind], toggle: (id: string) => store.toggle(key, kind, id), record: (id: string) => store.record(key, kind, id) };
}
