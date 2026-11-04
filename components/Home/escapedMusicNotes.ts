import { MAX_ESCAPED_NOTES, noteRandom } from './bubbleLift';
export interface EscapedMusicNote { id: number; x: number; y: number; seed: number; }
let notes: readonly EscapedMusicNote[] = [];
let lastBirth = -Infinity;
const listeners = new Set<() => void>();
export const getEscapedMusicNotes = () => notes;
export const canEscapeMusicNote = () => notes.length < MAX_ESCAPED_NOTES;
export function subscribeEscapedMusicNotes(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
// No persistence or expiry: survive navigation, clear only with the JS session.
export function escapeMusicNote(x: number, y: number) {
  const now = Date.now();
  if (!canEscapeMusicNote() || now - lastBirth < 6500 || !Number.isFinite(x) || !Number.isFinite(y)) return;
  lastBirth = now;
  const id = notes.length;
  notes = [...notes, { id, x, y, seed: noteRandom(id * 17 + 3) }];
  listeners.forEach(listener => listener());
}
