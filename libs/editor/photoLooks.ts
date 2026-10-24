import type { ClipEffects } from "./types";
import { validPhotoTone } from "./photoTone";
export interface PhotoLook { id: string; name: string; effects: ClipEffects; updatedAt: number }
const LIMITS = { brightness: [0, 2], contrast: [0, 2], saturation: [0, 2], blur: [0, 20], grayscale: [0, 1], sepia: [0, 1], hueRotate: [0, 360], invert: [0, 1], warmth: [-1, 1], tint: [-1, 1], vignette: [0, 1], vibrance: [-1, 1], highlights: [-1, 1], shadows: [-1, 1], fade: [0, 1], sharpen: [0, 1], grain: [0, 1] } as const;
export function normalisePhotoLook(value: unknown): ClipEffects {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Choose valid photo adjustments");
  const input = value as Record<string, unknown>, result: ClipEffects = {};
  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const amount = input[key]; if (amount === undefined) continue;
    const [min, max] = LIMITS[key];
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < min || amount > max) throw new Error("This photo look contains an invalid adjustment");
    result[key] = amount;
  }
  const duo = input.duotone;
  if (duo !== undefined && duo !== null) {
    if (typeof duo !== "object" || Array.isArray(duo)) throw new Error("This photo look contains invalid duotone colours");
    const tone = duo as Record<string, unknown>;
    if (typeof tone.dark !== "string" || typeof tone.light !== "string" || typeof tone.amount !== "number") throw new Error("This photo look contains invalid duotone colours");
    result.duotone = { dark: tone.dark, light: tone.light, amount: tone.amount };
  }
  if (!validPhotoTone(result)) throw new Error("This photo look contains invalid tone adjustments");
  return result;
}
export function photoLookAtStrength(effects: ClipEffects, strength: number): ClipEffects {
  const result = normalisePhotoLook(effects), amount = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 1;
  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    if (result[key] === undefined) continue;
    const neutral = key === "brightness" || key === "contrast" || key === "saturation" ? 1 : 0;
    result[key] = neutral + (result[key]! - neutral) * amount;
  }
  if (result.duotone) result.duotone = { ...result.duotone, amount: result.duotone.amount * amount };
  return result;
}
function lookName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error("Name this photo look using 1–60 characters");
  return name;
}
export function photoLookFile(effects: ClipEffects, name: string): string {
  return JSON.stringify({ kind: "dehub-photo-look", version: 1, name: lookName(name), effects: normalisePhotoLook(effects) }, null, 2) + "\n";
}
export function parsePhotoLookFile(raw: string): { name: string; effects: ClipEffects } {
  if (!raw || raw.length > 32768) throw new Error("Choose a photo-look JSON file smaller than 32 KB");
  let bytes = 0; for (const char of raw) { const code = char.codePointAt(0)!; bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4; }
  if (bytes > 32768) throw new Error("Choose a photo-look JSON file smaller than 32 KB");
  let value: unknown; try { value = JSON.parse(raw); } catch { throw new Error("Choose a valid photo-look JSON file"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Choose a DeHub photo-look file");
  const file = value as Record<string, unknown>;
  if (file.kind !== "dehub-photo-look" || file.version !== 1 || typeof file.name !== "string") throw new Error("Choose a supported DeHub photo-look file");
  return { name: lookName(file.name), effects: normalisePhotoLook(file.effects) };
}
const EMPTY: PhotoLook[] = [];
export function createPhotoLookStore(read: (key: string) => string | null | undefined, write: (key: string, value: string) => void) {
  const cache = new Map<string, PhotoLook[]>(), listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const get = (key: string): PhotoLook[] => {
    if (cache.has(key)) return cache.get(key)!;
    let looks: PhotoLook[] = [];
    try {
      const raw = read(key); if (raw && raw.length <= 100000) {
        const parsed: unknown = JSON.parse(raw), ids = new Set<string>();
        if (Array.isArray(parsed)) looks = parsed.slice(0, 20).flatMap(item => {
          try { if (!item || typeof item.id !== "string" || !item.id || item.id.length > 120 || ids.has(item.id) || typeof item.name !== "string") return []; const effects = normalisePhotoLook(item.effects), name = lookName(item.name); ids.add(item.id); return [{ id: item.id, name, effects, updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0 }]; } catch { return []; }
        });
      }
    } catch { /* Device preferences remain available in memory. */ }
    cache.set(key, looks); return looks;
  };
  const save = (key: string, looks: PhotoLook[]) => { cache.set(key, looks); let persisted = true; try { write(key, JSON.stringify(looks)); } catch { persisted = false; } notify(); return persisted; };
  return {
    get, empty: EMPTY,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    reload: (key: string) => { const previous = cache.get(key); cache.delete(key); if (JSON.stringify(previous) !== JSON.stringify(get(key))) notify(); },
    create: (key: string, inputName: string, input: ClipEffects) => {
      const looks = get(key), name = lookName(inputName), effects = normalisePhotoLook(input);
      if (looks.length >= 20) throw new Error("Keep up to 20 photo looks; remove one before saving another");
      if (looks.some(look => look.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("This name is already saved; choose another name or replace that look");
      const look: PhotoLook = { id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12), name, effects, updatedAt: Date.now() };
      return { look, persisted: save(key, [look, ...looks]) };
    },
    replace: (key: string, id: string, inputName: string, input: ClipEffects) => {
      const looks = get(key), name = lookName(inputName), effects = normalisePhotoLook(input);
      if (!looks.some(look => look.id === id)) throw new Error("This photo look is no longer available");
      if (looks.some(look => look.id !== id && look.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("Another photo look already uses this name");
      return save(key, looks.map(look => look.id === id ? { ...look, name, effects, updatedAt: Date.now() } : look));
    },
    remove: (key: string, id: string) => save(key, get(key).filter(look => look.id !== id)),
  };
}
