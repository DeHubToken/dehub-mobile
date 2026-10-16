import { useCallback, useSyncExternalStore } from "react";
import { useAccountDraftKey } from "../../hooks/useDraftState";
import { storage } from "../storage";
import { createReusableElementStore } from "./reusableElements";
import type { DesignClipboard } from "./designClipboard";
const store = createReusableElementStore(key => storage.getString(key), (key, value) => storage.set(key, value));
export function useReusableElements() {
  const key = "dehub-reusable-elements:v1:" + useAccountDraftKey("preferences"), items = useSyncExternalStore(store.subscribe, useCallback(() => store.get(key), [key]), () => store.empty);
  return { scope: key, items, create: (name: string, source: DesignClipboard) => store.create(key, name, source), remove: (id: string) => store.remove(key, id) };
}
