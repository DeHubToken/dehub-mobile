import { parseCloudProjectDocument } from "./cloudProjectFormat";
import { captureDesignSelection, pasteDesignSelection, type DesignClipboard } from "./designClipboard";
import { getPages, pageAt } from "./pages";
import { DEFAULT_SETTINGS, SHAPE_KINDS, type ProjectSnapshot } from "./types";

export interface ReusableElementSource extends DesignClipboard { canvas?: { width: number; height: number; background: string } }
export interface ReusableDesignElement { id: string; name: string; source: ReusableElementSource; updatedAt: number }
const EMPTY: ReusableDesignElement[] = [];
function validateSource(value: unknown): ReusableElementSource {
  if (!value || typeof value !== "object") throw new Error("Invalid saved element");
  const input = value as ReusableElementSource;
  if (!Array.isArray(input.layers) || !input.layers.length || input.layers.length > 100 || JSON.stringify(input).length > 200000) throw new Error("Save up to 100 text and vector layers per element, within 200 KB");
  if (input.layers.some(layer => !layer || !layer.clip || !["text", "shape"].includes(layer.clip.kind) || !layer.track || typeof layer.offset !== "number" || !Number.isFinite(layer.offset) || layer.offset < 0 || layer.offset > 86400 || typeof layer.fillPage !== "boolean")) throw new Error("Saved elements support text and vector artwork");
  const colour = (value: unknown) => typeof value === "string" && /^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(value);
  if (input.canvas && (!Number.isFinite(input.canvas.width) || !Number.isFinite(input.canvas.height) || input.canvas.width < 1 || input.canvas.width > 16384 || input.canvas.height < 1 || input.canvas.height > 16384 || !colour(input.canvas.background))) throw new Error("This element has an unsupported page size");
  for (const layer of input.layers) {
    const clip = layer.clip;
    if (clip.kind === "text" && (typeof clip.text !== "string" || clip.text.length > 100000 || typeof clip.fontFamily !== "string" || clip.fontFamily.length > 500 || !Number.isFinite(clip.fontSize) || clip.fontSize < 6 || clip.fontSize > 1000 || !Number.isFinite(clip.fontWeight) || clip.fontWeight < 100 || clip.fontWeight > 1000 || !["left", "centre", "right"].includes(clip.align) || !colour(clip.color) || !Number.isFinite(clip.x) || !Number.isFinite(clip.y))) throw new Error("This element contains unsupported text formatting");
    if (clip.kind === "shape" && (![...SHAPE_KINDS, "path"].includes(clip.shape) || !Number.isFinite(clip.w) || !Number.isFinite(clip.h) || clip.w <= 0 || clip.h <= 0 || clip.fill !== null && !colour(clip.fill))) throw new Error("This element contains unsupported vector artwork");
    if (clip.kind === "shape" && clip.shape === "path" && (!Array.isArray(clip.points) || clip.points.length > 12000 || clip.points.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)))) throw new Error("This element contains an unsupported drawing path");
  }
  const source = JSON.parse(JSON.stringify(input)) as ReusableElementSource;
  source.projectId = "saved-elements";
  source.layers = source.layers.map(layer => ({ ...layer, clip: { ...layer.clip, href: layer.clip.href?.startsWith("#page=") ? undefined : layer.clip.href, ...(layer.clip.kind === "text" ? { pageNumber: undefined } : {}) } }));
  const tracks = [...new Map(source.layers.map(layer => [layer.track.id, layer.track])).values()];
  parseCloudProjectDocument({ version: 1, media: [], snapshot: { id: "00000000-0000-0000-0000-000000000000", title: "Saved element", updatedAt: 0, settings: DEFAULT_SETTINGS, tracks, clips: source.layers.map(layer => layer.clip) } }, "0x0000000000000000000000000000000000000000");
  return source;
}
export function captureReusableElement(project: ProjectSnapshot, ids: readonly string[], time: number): DesignClipboard {
  const source = captureDesignSelection(project, ids, time);
  if (!source) throw new Error("Select unlocked text or vector artwork on this page");
  return validateSource({ ...source, canvas: { width: project.settings.width, height: project.settings.height, background: project.settings.background } });
}
export function insertReusableElement(project: ProjectSnapshot, source: DesignClipboard, time: number, makeId: () => string, options: { preserveProportions?: boolean } = {}) {
  const safe = validateSource(source), page = pageAt(getPages(project.settings, project.clips), time), duration = page.end - page.start;
  if (safe.layers.some(layer => !layer.fillPage && layer.offset + layer.clip.duration > duration + 1e-6)) throw new Error("Extend this page so all of the saved element's timing fits");
  const result = pasteDesignSelection(project, time, safe, makeId, { preserveProportions: options.preserveProportions ?? false });
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
  const undoHistory = new Map<string, ReusableDesignElement[][]>(), redoHistory = new Map<string, ReusableDesignElement[][]>();
  const remember = (history: Map<string, ReusableDesignElement[][]>, key: string, value: ReusableDesignElement[]) => history.set(key, [...(history.get(key) ?? []), value].slice(-5));
  const cache = new Map<string, ReusableDesignElement[]>(), listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const get = (key: string) => { if (!cache.has(key)) { let value = EMPTY; try { value = parse(read(key)); } catch { /* Keep preferences available for this visit. */ } cache.set(key, value); } return cache.get(key)!; };
  const save = (key: string, value: ReusableDesignElement[], record = true) => { const text = JSON.stringify(value); if (text.length > 1024 * 1024) throw new Error("The saved element library is full. Remove an element before adding another"); if (record && JSON.stringify(get(key)) !== text) { remember(undoHistory, key, get(key)); redoHistory.delete(key); } let persisted = true; try { write(key, text); } catch { persisted = false; } cache.set(key, value); notify(); return persisted; };
  return {
    get, empty: EMPTY,
    canUndo: (key: string) => !!undoHistory.get(key)?.length,
    canRedo: (key: string) => !!redoHistory.get(key)?.length,
    undo: (key: string) => { const history = undoHistory.get(key), previous = history?.[history.length - 1]; if (!previous) throw new Error("No library change to undo"); history!.pop(); remember(redoHistory, key, get(key)); return save(key, previous, false); },
    redo: (key: string) => { const history = redoHistory.get(key), next = history?.[history.length - 1]; if (!next) throw new Error("No library change to redo"); history!.pop(); remember(undoHistory, key, get(key)); return save(key, next, false); },
    create: (key: string, name: string, input: DesignClipboard) => {
      const elements = get(key), trimmed = name.trim().slice(0, 60); if (!trimmed) throw new Error("Give this element a name");
      if (elements.length >= 20) throw new Error("Keep up to 20 saved elements. Remove one before adding another");
      if (elements.some(element => element.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) throw new Error("An element already uses this name. Choose another name");
      const item = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`, name: trimmed, source: validateSource(input), updatedAt: Date.now() };
      return { item, persisted: save(key, [item, ...elements]) };
    },
    rename: (key: string, id: string, name: string) => {
      const elements = get(key), trimmed = name.trim().slice(0, 60);
      if (!elements.some(element => element.id === id)) throw new Error("This element is no longer available");
      if (!trimmed) throw new Error("Give this element a name");
      if (elements.some(element => element.id !== id && element.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) throw new Error("An element already uses this name. Choose another name");
      return save(key, elements.map(element => element.id === id ? { ...element, name: trimmed, updatedAt: Date.now() } : element));
    },
    replace: (key: string, id: string, input: DesignClipboard) => {
      const elements = get(key); if (!elements.some(element => element.id === id)) throw new Error("This element is no longer available");
      const source = validateSource(input);
      return save(key, elements.map(element => element.id === id ? { ...element, source, updatedAt: Date.now() } : element));
    },
    remove: (key: string, id: string) => save(key, get(key).filter(element => element.id !== id)),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    reload: (key: string) => { const previous = cache.get(key); cache.delete(key); if (JSON.stringify(previous) !== JSON.stringify(get(key))) { undoHistory.delete(key); redoHistory.delete(key); notify(); } },
  };
}

export function reusableElementFile(name: string, source: DesignClipboard): string {
  const safe = validateSource(source), trimmed = name.trim().slice(0, 60);
  if (!trimmed) throw new Error("Give this element a name");
  return JSON.stringify({ kind: "dehub-design-element", version: 1, name: trimmed, source: safe }) + "\n";
}
export function parseReusableElementFile(text: string): { name: string; source: DesignClipboard } {
  if (text.length > 800000) throw new Error("Choose an element file smaller than 800 KB");
  let input: unknown; try { input = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new Error("This file does not contain a valid saved element"); }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Choose an exported DeHub element file");
  const file = input as Record<string, unknown>;
  if (file.kind !== "dehub-design-element" || file.version !== 1 || typeof file.name !== "string" || !file.name.trim()) throw new Error("Choose a supported DeHub element file");
  return { name: file.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 60) || "Saved element", source: validateSource(file.source) };
}
export function uniqueReusableElementName(name: string, elements: readonly ReusableDesignElement[]): string {
  const names = new Set(elements.map(element => element.name.toLocaleLowerCase()));
  if (!names.has(name.toLocaleLowerCase())) return name;
  for (let index = 2; index <= 22; index++) { const candidate = `${name.slice(0, 55)} (${index})`; if (!names.has(candidate.toLocaleLowerCase())) return candidate; }
  throw new Error("Choose a different element name");
}

export function reusableElementPreview(projectId: string, element: ReusableDesignElement): ProjectSnapshot {
  const source = validateSource(element.source), canvas = source.canvas ?? { width: 1920, height: 1080, background: "#171717" };
  const tracks = [...new Map(source.layers.map(layer => [layer.track.id, { ...layer.track, hidden: false }])).values()];
  return { id: projectId, title: element.name, updatedAt: element.updatedAt, settings: { ...DEFAULT_SETTINGS, ...canvas, pages: [0], pageEnd: 5 }, tracks,
    clips: source.layers.map(layer => ({ ...layer.clip, start: 0, duration: 5, locked: false, hidden: false, animateIn: undefined, animateOut: undefined, transitionOut: undefined })) };
}
