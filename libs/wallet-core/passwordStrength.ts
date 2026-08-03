// Wallet-password strength assessment + Have I Been Pwned (HIBP) breach check
// — mobile counterpart of dehubweb's src/lib/wallet-core/passwordStrength.ts.
//
// This is the single highest-leverage control for the password-encrypted seed
// blob: Argon2id slows an offline guesser, but only a strong, un-breached
// password actually keeps a leaked `encrypted_seed` safe. The breach check uses
// HIBP's k-anonymity range API (only the first 5 hex chars of the SHA-1 are
// ever sent), and it FAILS OPEN — a network error never blocks wallet creation.
import * as Crypto from "expo-crypto";

export const MIN_PASSWORD_LENGTH = 12;

// A tiny set of obviously-bad passwords / patterns. Not exhaustive — the HIBP
// check is the real corpus; this just gives instant local feedback.
const COMMON = new Set([
  "password",
  "password1",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "letmein",
  "iloveyou",
  "admin123",
  "welcome1",
]);

export interface PasswordAssessment {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  warnings: string[];
  classCount: number;
  longEnough: boolean;
  breached: boolean | null; // null = not checked / check failed (fail-open)
  acceptable: boolean;
}

const LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"] as const;

function classCount(pw: string): number {
  let c = 0;
  if (/[a-z]/.test(pw)) c += 1;
  if (/[A-Z]/.test(pw)) c += 1;
  if (/[0-9]/.test(pw)) c += 1;
  if (/[^a-zA-Z0-9]/.test(pw)) c += 1;
  return c;
}

function looksTrivial(pw: string): boolean {
  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) return true;
  if (/^(.)\1+$/.test(pw)) return true; // all same char
  if (/^(0123456789|1234567890|abcdefghij|qwertyuiop)/.test(lower)) return true;
  return false;
}

/** Synchronous local assessment (no network) — drives the live strength meter. */
export function assessLocal(pw: string): PasswordAssessment {
  const warnings: string[] = [];
  const classes = classCount(pw);
  const longEnough = pw.length >= MIN_PASSWORD_LENGTH;

  let score = 0;
  if (pw.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (pw.length >= 16) score += 1;
  if (classes >= 2) score += 1;
  if (classes >= 3) score += 1;

  if (looksTrivial(pw)) {
    score = Math.min(score, 1);
    warnings.push("This is a common or predictable password");
  }
  if (!longEnough) warnings.push(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
  else if (classes < 2) warnings.push("Mix upper/lowercase, numbers, and symbols");

  const clamped = Math.max(0, Math.min(4, score)) as 0 | 1 | 2 | 3 | 4;
  return {
    score: clamped,
    label: LABELS[clamped],
    warnings,
    classCount: classes,
    longEnough,
    breached: null,
    acceptable: longEnough && classes >= 2 && !looksTrivial(pw),
  };
}

async function sha1Hex(input: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA1, input);
  return digest.toUpperCase();
}

/**
 * HIBP k-anonymity breach check. Returns true if the password appears in a
 * known breach, false if it doesn't, and null if the check couldn't run
 * (offline / rate-limited) so callers can fail open.
 */
export async function isBreached(pw: string): Promise<boolean | null> {
  try {
    const hash = await sha1Hex(pw);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    for (const line of text.split("\n")) {
      const [suf, count] = line.trim().split(":");
      if (suf === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return null;
  }
}

/** Full assessment: local scoring plus a (fail-open) breach check. */
export async function assessPassword(pw: string): Promise<PasswordAssessment> {
  const local = assessLocal(pw);
  const breached = await isBreached(pw);
  return {
    ...local,
    breached,
    // Breach only hard-blocks when the check actually ran and came back positive.
    acceptable: local.acceptable && breached !== true,
  };
}
