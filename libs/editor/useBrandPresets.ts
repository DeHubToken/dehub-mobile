import { useCallback, useSyncExternalStore } from "react";
import { useAccountDraftKey } from "../../hooks/useDraftState";
import { storage } from "../storage";
import { createBrandPresetStore } from "./brandPresets";
import type { BrandStyles } from "./brandStyles";
const store = createBrandPresetStore(key => storage.getString(key), (key, value) => storage.set(key, value));
export function useBrandPresets() {
  const key = "dehub-brand-presets:v1:" + useAccountDraftKey("preferences");
  const presets = useSyncExternalStore(store.subscribe, useCallback(() => store.get(key), [key]), () => store.empty);
  return { scope: key, presets, create: (name: string, styles: BrandStyles) => store.create(key, name, styles), replace: (id: string, styles: BrandStyles) => store.replace(key, id, styles), remove: (id: string) => store.remove(key, id) };
}
