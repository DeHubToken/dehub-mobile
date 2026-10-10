import { clearDraft, flushDrafts, readDraft, writeDraft } from '../draft-cache';
import type { ProjectSnapshot } from './types';

export function lastRecoveryProject(scope: string): string | null {
  return readDraft(`${scope}:last`) || null;
}

export function readEditorRecovery(scope: string, id: string): ProjectSnapshot | null {
  try {
    const value = JSON.parse(readDraft(`${scope}:${id}`)) as ProjectSnapshot;
    if (value.id !== id || typeof value.title !== 'string' || !Array.isArray(value.clips)
      || !Array.isArray(value.tracks) || !value.settings || typeof value.updatedAt !== 'number') return null;
    return value;
  } catch { return null; }
}

/** Synchronous recovery closes the gap before the project database has committed. */
export function writeEditorRecovery(scope: string, snapshot: ProjectSnapshot): void {
  writeDraft(`${scope}:${snapshot.id}`, JSON.stringify(snapshot));
  writeDraft(`${scope}:last`, snapshot.id);
  flushDrafts();
}

export function completeEditorRecovery(scope: string, snapshot: ProjectSnapshot): void {
  const key = `${scope}:${snapshot.id}`;
  if (readDraft(key) === JSON.stringify(snapshot)) clearDraft(key);
  flushDrafts();
}

export function discardEditorRecovery(scope: string, id: string): void {
  clearDraft(`${scope}:${id}`);
  if (lastRecoveryProject(scope) === id) clearDraft(`${scope}:last`);
  flushDrafts();
}
