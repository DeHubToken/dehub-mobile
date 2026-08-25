/**
 * Impersonation Detection
 * =======================
 * Scam comments work by wearing the creator's name. The account is different —
 * it has to be — but the display name is copied closely enough that a reader
 * skimming a thread reads it as the creator replying, and follows whatever it
 * asks them to do.
 *
 * Plain string equality does not catch it, because the copy is never exact: a
 * Cyrillic "а" for a Latin "a", a zero for an "o", a zero-width joiner in the
 * middle, a trailing full stop. That is the same trick that walks straight
 * through blocked-word lists, so the fix is the same one: fold the confusables
 * away before comparing, then allow one typo of slack.
 *
 * This is a reader-side warning, not enforcement. It never hides a comment —
 * it says whose account a name does not belong to, and lets the reader decide.
 *
 * @module libs/impersonation
 */

/**
 * Characters that read as another character. Only the ones actually used in
 * name spoofing — a full Unicode confusables table is thousands of entries and
 * most of it is irrelevant to Latin-script display names.
 */
const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm',
  'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't',
  'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's',
  'ԁ': 'd', 'ѵ': 'v',
  // Greek
  'α': 'a', 'β': 'b', 'ε': 'e', 'ι': 'i', 'κ': 'k',
  'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x',
  'ν': 'v', 'µ': 'u',
  // Latin lookalikes that survive NFKD
  'ɡ': 'g', 'ɪ': 'i', 'ᴏ': 'o', 'ᴀ': 'a', 'ᴇ': 'e',
  'ʀ': 'r', 'ⅼ': 'l',
  // Digits and symbols standing in for letters
  '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
  '@': 'a', '$': 's', '!': 'i', '|': 'l', '¡': 'i',
};

/** Zero-width and directional marks — invisible, and free spoofing material. */
const INVISIBLE = /[​-‏‪-‮⁠-⁯﻿]/g;

/** Combining accents left behind by NFKD. */
const COMBINING = /[̀-ͯ]/g;

/**
 * Fold a display name to what a reader actually sees: no accents, no
 * confusables, no invisibles, no punctuation, no repeated letters.
 *
 * Repeats collapse because "DeHubb" and "DeHub" are the same name to a
 * skim-reader, and doubling a letter is the cheapest evasion there is.
 */
export function foldName(name: string): string {
  if (!name) return '';
  const stripped = name
    .normalize('NFKD')
    .replace(COMBINING, '')
    .replace(INVISIBLE, '')
    .toLowerCase();

  let folded = '';
  for (const char of stripped) {
    folded += CONFUSABLES[char] ?? char;
  }

  return folded
    .replace(/[^a-z0-9]/g, '')        // spaces, emoji, punctuation
    .replace(/(.)\1+/g, '$1');        // "dehubbb" -> "dehub"
}

/** Levenshtein, bounded — anything past `max` stops early. */
function editDistanceWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return false;
    previous = current;
  }
  return previous[b.length] <= max;
}

/** Names shorter than this are too generic to accuse anyone over. */
const MIN_NAME_LENGTH = 4;

/**
 * Does `candidate` read as `target` without being it?
 *
 * Exact folded equality always counts. Beyond that, one edit of slack for a
 * name of five characters or more — enough for a dropped letter or an inserted
 * one, not enough to flag two people who happen to share a short handle.
 */
export function looksLike(candidate: string, target: string): boolean {
  const a = foldName(candidate);
  const b = foldName(target);
  if (!a || !b) return false;
  if (a.length < MIN_NAME_LENGTH || b.length < MIN_NAME_LENGTH) return a === b;
  if (a === b) return true;
  return b.length >= 5 && editDistanceWithin(a, b, 1);
}

export interface ImpersonationCheck {
  /** The commenter is the post's creator. */
  isCreator: boolean;
  /** The commenter is not the creator but is wearing their name. */
  isImpersonating: boolean;
}

/**
 * Compare one commenter against the post's creator.
 *
 * Address is the identity; names are only ever evidence. A missing address on
 * either side means no claim is made — an unknown author is not an accusation.
 */
export function checkImpersonation(
  commenter: { address?: string | null; displayName?: string | null; username?: string | null },
  creator: { address?: string | null; displayName?: string | null; username?: string | null } | null | undefined,
): ImpersonationCheck {
  const commenterAddress = (commenter.address ?? '').toLowerCase();
  const creatorAddress = (creator?.address ?? '').toLowerCase();
  if (!commenterAddress || !creatorAddress) return { isCreator: false, isImpersonating: false };

  if (commenterAddress === creatorAddress) return { isCreator: true, isImpersonating: false };

  const creatorNames = [creator?.displayName, creator?.username].filter((n): n is string => !!n);
  const commenterNames = [commenter.displayName, commenter.username].filter((n): n is string => !!n);
  const isImpersonating = creatorNames.some(target => commenterNames.some(name => looksLike(name, target)));

  return { isCreator: false, isImpersonating };
}

/**
 * The identity a chip is drawn against. Named because three components pass it
 * down and an inline object type in each of them drifts.
 */
export interface PostCreator {
  address?: string | null;
  displayName?: string | null;
  username?: string | null;
}
