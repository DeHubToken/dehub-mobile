import { useSyncExternalStore } from 'react';

export type StageDubStatus = 'original' | 'preparing' | 'ready' | 'failed';
type Selection = { language: string; status: StageDubStatus };
const original: Selection = { language: 'original', status: 'original' };
const selections = new Map<string, Selection>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getStageRecordingLanguage = (id?: string | null): Selection => id ? selections.get(id) ?? original : original;
export function setStageRecordingLanguage(id: string, language: string) {
  language = language.toLowerCase().replace(/_/g, '-');
  if (language !== 'original' && !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(language)) return;
  if (getStageRecordingLanguage(id).language === language) return;
  selections.set(id, { language, status: language === 'original' ? 'original' : 'preparing' });
  listeners.forEach((listener) => listener());
}
export function setStageRecordingDubStatus(id: string, language: string, status: StageDubStatus) {
  const selected = getStageRecordingLanguage(id);
  if (selected.language !== language || selected.status === status) return;
  selections.set(id, { language, status });
  listeners.forEach((listener) => listener());
}
export function useStageRecordingLanguage(id?: string | null) {
  return useSyncExternalStore(subscribe, () => getStageRecordingLanguage(id), () => original);
}

export const STAGE_RECORDING_LANGUAGES = [
  ['en', 'English'], ['es', 'Español'], ['pt', 'Português'], ['fr', 'Français'],
  ['de', 'Deutsch'], ['it', 'Italiano'], ['nl', 'Nederlands'], ['pl', 'Polski'],
  ['ru', 'Русский'], ['tr', 'Türkçe'], ['ar', 'العربية'], ['he', 'עברית'],
  ['hi', 'हिन्दी'], ['ms', 'Bahasa Melayu'], ['ja', '日本語'], ['ko', '한국어'],
  ['zh', '中文'], ['sv', 'Svenska'], ['no', 'Norsk'], ['da', 'Dansk'],
  ['fi', 'Suomi'], ['el', 'Ελληνικά'], ['sw', 'Kiswahili'],
] as const;
