import { normaliseBrandStyles, validBrandStyles, type BrandStyles } from "./brandStyles";
export interface BrandPreset { id: string; name: string; styles: BrandStyles; updatedAt: number }
const EMPTY_PRESETS: BrandPreset[] = [];
function parse(raw: string | null | undefined): BrandPreset[] {
  try {
    if (!raw || raw.length > 100000) return EMPTY_PRESETS;
    const value: unknown = JSON.parse(raw); if (!Array.isArray(value)) return EMPTY_PRESETS;
    const ids = new Set<string>();
    return value.slice(0, 20).flatMap(item => {
      if (!item || typeof item.id !== "string" || !item.id || item.id.length > 120 || ids.has(item.id) || typeof item.name !== "string" || !item.name.trim() || item.name.length > 60 || !item.styles || !validBrandStyles(item.styles)) return [];
      ids.add(item.id);
      return [{ id: item.id, name: item.name.trim(), styles: normaliseBrandStyles(item.styles), updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0 }];
    });
  } catch { return EMPTY_PRESETS; }
}
export function createBrandPresetStore(read: (key: string) => string | null | undefined, write: (key: string, value: string) => void) {
  const cache = new Map<string, BrandPreset[]>(), listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const get = (key: string) => { if (!cache.has(key)) { let value = EMPTY_PRESETS; try { value = parse(read(key)); } catch { /* Keep device preferences available without storage. */ } cache.set(key, value); } return cache.get(key)!; };
  const save = (key: string, presets: BrandPreset[]) => { cache.set(key, presets); let persisted = true; try { write(key, JSON.stringify(presets)); } catch { persisted = false; } notify(); return persisted; };
  const styles = (input: BrandStyles) => { const next = normaliseBrandStyles(input); if (!next.colors.length && !next.headingFont && !next.bodyFont) throw new Error("Choose brand colours or fonts before saving a preset"); return next; };
  return {
    get,
    create: (key: string, name: string, input: BrandStyles) => {
      const presets = get(key), trimmed = name.trim().slice(0, 60);
      if (!trimmed) throw new Error("Give this brand preset a name");
      if (presets.length >= 20) throw new Error("Keep up to 20 brand presets. Remove one before adding another");
      if (presets.some(preset => preset.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) throw new Error("A brand preset already uses this name. Choose another name or replace that preset");
      const preset = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`, name: trimmed, styles: styles(input), updatedAt: Date.now() };
      return { preset, persisted: save(key, [preset, ...presets]) };
    },
    replace: (key: string, id: string, input: BrandStyles) => { const presets = get(key); if (!presets.some(preset => preset.id === id)) throw new Error("This brand preset is no longer available"); const next = styles(input); return save(key, presets.map(preset => preset.id === id ? { ...preset, styles: next, updatedAt: Date.now() } : preset)); },
    remove: (key: string, id: string) => save(key, get(key).filter(preset => preset.id !== id)),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    reload: (key: string) => { const previous = cache.get(key); cache.delete(key); if (JSON.stringify(previous) !== JSON.stringify(get(key))) notify(); },
    empty: EMPTY_PRESETS,
  };
}
