import { useCallback, useSyncExternalStore } from 'react';
import i18n from 'i18next';
import { translateText, getUserLanguage } from '../services/translation.service';
import { toastError, toastSuccess } from './toast';

/**
 * Translate for direct messages. The menu (held message) starts it and the
 * bubble shows the result, so the state lives here, keyed by message id.
 *
 * Only on request, never automatic: a DM is private and translating sends it
 * to a third party, so it goes out as private text (isPublic false).
 */
export type DmTranslation =
  | { status: 'loading' }
  | { status: 'shown'; text: string }
  | { status: 'hidden'; text: string };

const entries = new Map<string, DmTranslation>();
const listeners = new Map<string, Set<() => void>>();

function set(id: string, next: DmTranslation | undefined) {
  if (next) entries.set(id, next);
  else entries.delete(id);
  listeners.get(id)?.forEach((fn) => fn());
}

/** Text worth translating: links and @/$ handles left out, they don't translate. */
export function dmTranslatableText(content?: string | null): string {
  return (content ?? '').replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Has at least a few letters, so emoji-only or link-only messages get no Translate. */
export function canTranslateDm(content?: string | null): boolean {
  return dmTranslatableText(content).replace(/[^\p{L}]/gu, '').length >= 2;
}

export function getDmTranslation(id: string): DmTranslation | undefined {
  return entries.get(id);
}

export function useDmTranslation(id: string | undefined): DmTranslation | undefined {
  const subscribe = useCallback((fn: () => void) => {
    if (!id) return () => {};
    let bucket = listeners.get(id);
    if (!bucket) listeners.set(id, (bucket = new Set()));
    bucket.add(fn);
    return () => { bucket!.delete(fn); };
  }, [id]);
  return useSyncExternalStore(subscribe, () => (id ? entries.get(id) : undefined));
}

/** Translate, or flip between the translation and the original. */
export async function toggleDmTranslation(id: string, content?: string | null): Promise<void> {
  const current = entries.get(id);
  if (current?.status === 'loading') return;
  if (current?.status === 'shown') return set(id, { status: 'hidden', text: current.text });
  if (current?.status === 'hidden') return set(id, { status: 'shown', text: current.text });

  const text = dmTranslatableText(content);
  if (!text) return;
  set(id, { status: 'loading' });
  try {
    const result = await translateText(text, getUserLanguage(), 'auto', { isPublic: false });
    if (result.sameLanguage || !result.translatedText?.trim()) {
      set(id, undefined);
      toastSuccess(i18n.t('copy.caac88c81c38', { defaultValue: 'Already in your language' }));
      return;
    }
    set(id, { status: 'shown', text: result.translatedText });
  } catch {
    set(id, undefined);
    toastError(i18n.t('copy.b9725da1e57f', { defaultValue: 'Translation failed. Please try again.' }));
  }
}

/** Tests only. */
export function __resetDmTranslations() {
  entries.clear();
  listeners.clear();
}
