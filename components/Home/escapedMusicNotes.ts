import { MAX_ESCAPED_NOTES, noteRandom } from './bubbleLift';
export interface EscapedMusicNote { id: number; x: number; y: number; seed: number; }
let notes: readonly EscapedMusicNote[] = [];
let lastBirth = -Infinity, births = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
export const getEscapedMusicNotes = () => notes;
export const canEscapeMusicNote = () => notes.length < MAX_ESCAPED_NOTES;
export function subscribeEscapedMusicNotes(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
// Survive navigation; each bubble pops after NOTE_LIFETIME (EscapedMusicNotesHost removes it).
export function escapeMusicNote(x: number, y: number) {
  const now = Date.now();
  if (!canEscapeMusicNote() || now - lastBirth < 6500 || !Number.isFinite(x) || !Number.isFinite(y)) return;
  lastBirth = now;
  const id = births++;
  notes = [...notes, { id, x, y, seed: noteRandom(id * 17 + 3) }];
  notify();
}
export function popMusicNotes(ids: readonly number[]) {
  const next = notes.filter(note => !ids.includes(note.id));
  if (next.length === notes.length) return;
  notes = next;
  notify();
}
