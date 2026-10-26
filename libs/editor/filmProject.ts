import { normalizeCinemaDirection, type CinemaDirection } from '../cinemaDirection';
import { generationDraft, type GenerationDraft } from './generationDraft';

export interface FilmShot {
  id: string;
  title: string;
  prompt: string;
  seconds: number;
  direction?: CinemaDirection;
  referenceMediaIds: string[];
  resultMediaId?: string;
  [field: string]: unknown;
}
export interface FilmProject {
  version: 1;
  title: string;
  brief: string;
  referenceMediaIds: string[];
  shots: FilmShot[];
  [field: string]: unknown;
}
export interface FilmMedia { id: string; kind: string; name: string; url: string }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const string = (value: unknown, limit: number) => typeof value === 'string' && value.length <= limit;
const ids = (value: unknown) => Array.isArray(value) && value.length <= 4 && value.every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id)) && new Set(value).size === value.length;

export function validFilmProject(value: unknown): value is FilmProject {
  if (!object(value) || value.version !== 1 || !string(value.title, 200) || !string(value.brief, 3000) || !ids(value.referenceMediaIds)
    || !Array.isArray(value.shots) || value.shots.length > 12) return false;
  const used = new Set<string>();
  return value.shots.every(shot => {
    if (!object(shot) || typeof shot.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(shot.id) || used.has(shot.id)
      || !string(shot.title, 200) || !string(shot.prompt, 2000) || typeof shot.seconds !== 'number' || !Number.isFinite(shot.seconds) || shot.seconds < 1 || shot.seconds > 30
      || !ids(shot.referenceMediaIds) || (shot.resultMediaId !== undefined && (typeof shot.resultMediaId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(shot.resultMediaId)))
      || (shot.direction !== undefined && !object(shot.direction))) return false;
    used.add(shot.id); return true;
  });
}

export function filmProjectMediaIds(value: FilmProject | undefined): string[] {
  return validFilmProject(value) ? [...new Set([...value.referenceMediaIds, ...value.shots.flatMap(shot => [...shot.referenceMediaIds, ...(shot.resultMediaId ? [shot.resultMediaId] : [])])])] : [];
}

/** Preserve unknown future metadata while translating only explicit media links. */
export function remapFilmProjectMedia(value: FilmProject, ids: ReadonlyMap<string, string>): FilmProject {
  const map = (id: string) => ids.get(id) ?? id;
  return { ...value, referenceMediaIds: value.referenceMediaIds.map(map), shots: value.shots.map(shot => ({ ...shot,
    referenceMediaIds: shot.referenceMediaIds.map(map), ...(shot.resultMediaId ? { resultMediaId: map(shot.resultMediaId) } : {}),
  })) };
}

/** Resolve references from the actual editor media index, never from supplied remote URLs. */
export function filmShotDraft(film: FilmProject, shotId: string, kind: 'image' | 'video', media: readonly FilmMedia[], aspect: string, projectId: string): GenerationDraft | null {
  if (!validFilmProject(film) || !/^[a-zA-Z0-9_-]{1,80}$/.test(projectId)) return null;
  const shot = film.shots.find(item => item.id === shotId);
  if (!shot?.prompt.trim()) return null;
  const selected = [...new Set([...film.referenceMediaIds, ...shot.referenceMediaIds])];
  const result = shot.resultMediaId ? media.find(item => item.id === shot.resultMediaId) : undefined;
  if (kind === 'video' && result?.kind === 'image' && !selected.includes(result.id)) selected.unshift(result.id);
  if (selected.length > 4) return null;
  const references = selected.map(id => media.find(item => item.id === id && item.kind === 'image'));
  if (references.some(reference => !reference)) return null;
  const prompt = [film.brief.trim() ? `Film brief: ${film.brief.trim()}` : '', `Shot: ${shot.prompt.trim()}`,
    references.length ? 'Use the attached references consistently for this shot. Preserve recognizable subject and setting details.' : ''].filter(Boolean).join('\n\n');
  const direction = normalizeCinemaDirection(shot.direction);
  let hash = 2166136261;
  for (const char of JSON.stringify([kind, prompt, direction, aspect, selected, shot.seconds])) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return generationDraft({ kind, aspect, prompt, cinemaDirection: direction, workspaceId: `film-${projectId}-${shot.id}-${kind}`, draftId: `film-${(hash >>> 0).toString(36)}`,
    references: references.map(reference => ({ url: reference!.url, label: reference!.name.slice(0, 200) })), ...(kind === 'video' ? { durationSeconds: shot.seconds } : {}) });
}
