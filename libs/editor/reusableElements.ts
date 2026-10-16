import { parseCloudProjectDocument } from "./cloudProjectFormat";
import { captureDesignSelection, pasteDesignSelection, type DesignClipboard } from "./designClipboard";
import { getPages, pageAt } from "./pages";
import { DEFAULT_SETTINGS, type ProjectSnapshot } from "./types";

export interface ReusableDesignElement { id: string; name: string; source: DesignClipboard; updatedAt: number }
const EMPTY: ReusableDesignElement[] = [];
function validateSource(value: unknown): DesignClipboard {
  if (!value || typeof value !== "object") throw new Error("Invalid saved element");
  const input = value as DesignClipboard;
  if (!Array.isArray(input.layers) || !input.layers.length || input.layers.length > 100 || JSON.stringify(input).length > 200000) throw new Error("Save up to 100 text and vector layers per element, within 200 KB");
  if (input.layers.some(layer => !layer || !layer.clip || !["text", "shape"].includes(layer.clip.kind) || !layer.track || typeof layer.offset !== "number" || !Number.isFinite(layer.offset) || layer.offset < 0 || layer.offset > 86400 || typeof layer.fillPage !== "boolean")) throw new Error("Saved elements support text and vector artwork");
  const source = JSON.parse(JSON.stringify(input)) as DesignClipboard;
  source.projectId = "saved-elements";
  source.layers = source.layers.map(layer => ({ ...layer, clip: { ...layer.clip, href: layer.clip.href?.startsWith("#page=") ? undefined : layer.clip.href, ...(layer.clip.kind === "text" ? { pageNumber: undefined } : {}) } }));
  const tracks = [...new Map(source.layers.map(layer => [layer.track.id, layer.track])).values()];
  parseCloudProjectDocument({ version: 1, media: [], snapshot: { id: "00000000-0000-0000-0000-000000000000", title: "Saved element", updatedAt: 0, settings: DEFAULT_SETTINGS, tracks, clips: source.layers.map(layer => layer.clip) } }, "0x0000000000000000000000000000000000000000");
  return source;
}
export function captureReusableElement(project: ProjectSnapshot, ids: readonly string[], time: number): DesignClipboard {
  const source = captureDesignSelection(project, ids, time);
  if (!source) throw new Error("Select unlocked text or vector artwork on this page");
  return validateSource(source);
}
export function insertReusableElement(project: ProjectSnapshot, source: DesignClipboard, time: number, makeId: () => string) {
  const safe = validateSource(source), page = pageAt(getPages(project.settings, project.clips), time), duration = page.end - page.start;
  if (safe.layers.some(layer => !layer.fillPage && layer.offset + layer.clip.duration > duration + 1e-6)) throw new Error("Extend this page so all of the saved element's timing fits");
  const result = pasteDesignSelection(project, time, safe, makeId);
  if (!result || result.skipped) throw new Error("This saved element does not fit the current page");
  if (JSON.stringify(result.project).length > 2 * 1024 * 1024) {
    let bytes = 0; for (const char of JSON.stringify(result.project)) { const value = char.codePointAt(0)!; bytes += value < 128 ? 1 : value < 2048 ? 2 : value < 65536 ? 3 : 4; }
    if (bytes > 6 * 1024 * 1024) throw new Error("This design is too large to add the saved element");
  }
  return result;
}
function parse(raw: string | null | undefined): ReusableDesignElement[] {
  try {
    if (!raw || raw.length > 1024 * 1024) return EMPTY;
    const value: unknown = JSON.parse(raw); if (!Array.isArray(value) || value.length > 20) return EMPTY;
    const ids = new Set<string>();
    return value.flatMap(item => {
      try {
        if (!item || typeof item.id !== "string" || !item.id || item.id.length > 120 || ids.has(item.id) || typeof item.name !== "string" || !item.name.trim() || item.name.length > 60) return [];
        const source = validateSource(item.source); ids.add(item.id);
        return [{ id: item.id, name: item.name, source, updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0 }];
      } catch { return []; }
    });
  } catch { return EMPTY; }
}
export function createReusableElementStore(read: (key: string) => string | null | undefined, write: (key: string, value: string) => void) {
  const cache = new Map<string, ReusableDesignElement[]>(), listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const get = (key: string) => { if (!cache.has(key)) { let value = EMPTY; try { value = parse(read(key)); } catch { /* Keep preferences available for this visit. */ } cache.set(key, value); } return cache.get(key)!; };
  const save = (key: string, value: ReusableDesignElement[]) => { const text = JSON.stringify(value); if (text.length > 1024 * 1024) throw new Error("The saved element library is full. Remove an element before adding another"); let persisted = true; try { write(key, text); } catch { persisted = false; } cache.set(key, value); notify(); return persisted; };
  return {
    get, empty: EMPTY,
    create: (key: string, name: string, input: DesignClipboard) => {
      const elements = get(key), trimmed = name.trim().slice(0, 60); if (!trimmed) throw new Error("Give this element a name");
      if (elements.length >= 20) throw new Error("Keep up to 20 saved elements. Remove one before adding another");
      if (elements.some(element => element.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) throw new Error("An element already uses this name. Choose another name");
      const item = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`, name: trimmed, source: validateSource(input), updatedAt: Date.now() };
      return { item, persisted: save(key, [item, ...elements]) };
    },
    remove: (key: string, id: string) => save(key, get(key).filter(element => element.id !== id)),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    reload: (key: string) => { const previous = cache.get(key); cache.delete(key); if (JSON.stringify(previous) !== JSON.stringify(get(key))) notify(); },
  };
}
