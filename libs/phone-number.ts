// E.164 handling for the sign-in phone field.
//
// The "+" is NOT something the user types. It is the one character of an E.164
// number that is always present and never varies, and it is also the one
// character a phone keypad makes awkward to reach — so the field owns it and
// the TextInput holds digits only. That is what lets the input be strictly
// numeric (`phone-pad`), and it removes the failure mode where a perfectly
// correct number is rejected because the leading "+" was never typed.
//
// The regex the edge function enforces is `^\+[1-9]\d{6,14}$` (see
// supabase/functions/request-phone-otp) — 7 to 15 digits, first digit non-zero.
// `isValidNationalDigits` below is that same rule expressed over the digits, so
// the two can't drift.
//
// THE HAZARD THIS MODULE EXISTS TO CONTAIN: reducing text to digits is not a
// lossless view of a phone number. "(415) 555-2671" reduces to 4155552671,
// which is a perfectly well-formed *+41* number — so a paste that drops its
// country code does not fail, it silently becomes a number in Switzerland.
// Everything below is arranged so that the shapes we cannot interpret
// correctly are either converted properly or flagged, never quietly accepted.

export const MIN_E164_DIGITS = 7;
export const MAX_E164_DIGITS = 15;

/** "+44 (0)7911 123456" — the parenthesised trunk digit, dropped when dialling out. */
const BRACKETED_TRUNK_ZERO = /\(\s*0\s*\)/g;
/** Any separator a human or a contacts app writes: space, dash, dot, bracket, NBSP. */
const HAS_SEPARATOR = /[^\d+]/;
/** An explicit international prefix — either form. */
const HAS_INTERNATIONAL_PREFIX = /^\s*(\+|00)/;

/**
 * Reduce anything the user typed or pasted to the digits that follow the "+".
 *
 * Three transformations, in order, each load-bearing:
 *
 *  1. "(0)" is deleted as a group. It is the published notation for a national
 *     trunk digit that must be DROPPED when dialling internationally, so
 *     "+44 (0)7911 123456" is 447911123456. Merely stripping the brackets
 *     would leave 4407911123456 — one digit too long, and still valid-looking.
 *  2. Everything that isn't a digit goes.
 *  3. A leading "00" goes: that is the ITU international access prefix, which
 *     is exactly what the "+" replaces, so keeping it would dial a different
 *     (usually nonexistent) country.
 *
 * A leading zero that is NOT part of "00" or "(0)" is left alone on purpose.
 * It is a national trunk prefix ("07911…"), and silently deleting it would
 * turn a UK mobile into a Russian number that validates and gets an SMS sent
 * to it. Left in place it fails validation, and the field says why.
 *
 * Nothing is truncated here. An over-long number must FAIL, not be sliced into
 * a valid prefix — a silently shortened number is still a number, just someone
 * else's.
 */
export function toNationalDigits(raw: string): string {
  const withoutTrunkGroup = (raw ?? "").replace(BRACKETED_TRUNK_ZERO, "");
  const digits = withoutTrunkGroup.replace(/\D/g, "");
  return digits.startsWith("00") ? digits.slice(2) : digits;
}

/** The E.164 string to submit — the field's implicit "+" made explicit. */
export function toE164(nationalDigits: string): string {
  return `+${nationalDigits}`;
}

/** Same rule as the edge function's regex, minus the "+" the field supplies. */
export function isValidNationalDigits(digits: string): boolean {
  return /^[1-9]\d{6,14}$/.test(digits);
}

/**
 * What to tell the user about what they just entered, or null when there is
 * nothing worth saying.
 *
 * Takes the raw text as well as the digits because the most dangerous input is
 * one the digits alone cannot diagnose: a nationally-formatted number pasted
 * from a contacts app, whose digits are a valid E.164 number for some other
 * country. The give-away is in the raw text — it carries separators (so it was
 * pasted or autofilled, not keyed in) yet has no "+" or "00" to say which
 * country it belongs to.
 */
export function phoneEntryHint(raw: string, digits: string): string | null {
  if (digits.startsWith("0")) {
    return "Start with your country code (44 for the UK, 1 for the US) — drop the leading 0.";
  }
  if (digits.length > MAX_E164_DIGITS) {
    return `That's ${digits.length} digits — a phone number has at most ${MAX_E164_DIGITS}.`;
  }
  if (
    isValidNationalDigits(digits) &&
    HAS_SEPARATOR.test((raw ?? "").trim()) &&
    !HAS_INTERNATIONAL_PREFIX.test(raw ?? "")
  ) {
    return "Check the country code — numbers copied from Contacts often leave it out.";
  }
  return null;
}
