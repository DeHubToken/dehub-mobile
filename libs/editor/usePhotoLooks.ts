import { useCallback, useSyncExternalStore } from "react";
import { useAccountDraftKey } from "../../hooks/useDraftState";
import { storage } from "../storage";
import { createPhotoLookStore } from "./photoLooks";
import type { ClipEffects } from "./types";
const store = createPhotoLookStore(key => storage.getString(key), (key, value) => storage.set(key, value));
export function usePhotoLooks() {
  const key = "dehub-photo-looks:v1:" + useAccountDraftKey("preferences");
  const looks = useSyncExternalStore(store.subscribe, useCallback(() => store.get(key), [key]), () => store.empty);
  return { scope: key, looks, create: (name: string, effects: ClipEffects) => store.create(key, name, effects), replace: (id: string, name: string, effects: ClipEffects) => store.replace(key, id, name, effects), remove: (id: string) => store.remove(key, id) };
}
