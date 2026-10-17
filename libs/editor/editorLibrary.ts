export type EditorLibraryKind = "fonts" | "symbols";
export type EditorLibraryState = Record<EditorLibraryKind, { saved: string[]; recent: string[] }>;
export const EMPTY_EDITOR_LIBRARY: EditorLibraryState = { fonts: { saved: [], recent: [] }, symbols: { saved: [], recent: [] } };
function clean(value: unknown, maximum: number): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 160))].slice(0, maximum) : [];
}
function parse(raw: string | null | undefined): EditorLibraryState {
  try {
    if (!raw || raw.length > 40000) return EMPTY_EDITOR_LIBRARY;
    const value = JSON.parse(raw);
    return { fonts: { saved: clean(value?.fonts?.saved, 100), recent: clean(value?.fonts?.recent, 20) }, symbols: { saved: clean(value?.symbols?.saved, 100), recent: clean(value?.symbols?.recent, 20) } };
  } catch { return EMPTY_EDITOR_LIBRARY; }
}

export function createEditorLibraryStore(read: (key: string) => string | null | undefined, write: (key: string, value: string) => void) {
  const cache = new Map<string, EditorLibraryState>(), listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const get = (key: string) => {
    if (!cache.has(key)) {
      let value = EMPTY_EDITOR_LIBRARY; try { value = parse(read(key)); } catch { /* Keep local preferences available without storage. */ }
      cache.set(key, value);
    }
    return cache.get(key)!;
  };
  const change = (key: string, kind: EditorLibraryKind, id: string, save: boolean) => {
    if (!id || id.length > 160) return;
    const before = get(key), list = before[kind];
    const next = { ...before, [kind]: save ? { ...list, saved: list.saved.includes(id) ? list.saved.filter(value => value !== id) : [id, ...list.saved].slice(0, 100) }
      : { ...list, recent: [id, ...list.recent.filter(value => value !== id)].slice(0, 20) } };
    cache.set(key, next);
    try { write(key, JSON.stringify(next)); } catch { /* Retain the current session's choices. */ }
    notify();
  };
  return { get, record: (key: string, kind: EditorLibraryKind, id: string) => change(key, kind, id, false), toggle: (key: string, kind: EditorLibraryKind, id: string) => change(key, kind, id, true),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    reload: (key: string) => { const before = cache.get(key); cache.delete(key); if (JSON.stringify(before) !== JSON.stringify(get(key))) notify(); } };
}
