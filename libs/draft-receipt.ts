import { clearDraft, flushDrafts, readDraft } from './draft-cache';

/** A completed upload can consume only the exact fields it submitted. */
export function completeDraftReceipt(receipt: Record<string, string>): boolean {
  let unchanged = true;
  for (const [key, expected] of Object.entries(receipt)) {
    const current = readDraft(key);
    if (current === expected) clearDraft(key);
    else if (current) unchanged = false;
  }
  flushDrafts();
  return unchanged;
}
