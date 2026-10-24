import { translateCopy as _translateCopy } from '../../i18n/copy';

// Resource limits apply only when opening stored data; encryption defaults and
// payload bytes stay unchanged, including older 19 MiB Argon2id wallets.
export function validateArgon2Parameters(params: { m: number; t: number; p: number }): void {
  const { m, t, p } = params;
  if (!Number.isSafeInteger(m) || !Number.isSafeInteger(t) || !Number.isSafeInteger(p)
    || p < 1 || p > 16 || m < 8 * p || m > 262_144 || t < 1 || t > 10) {
    throw new Error(_translateCopy('copy.55938514ff76', { defaultValue: 'Unsupported wallet encryption parameters. Your saved wallet has not been changed.' }));
  }
}

export function validatePbkdf2Iterations(iterations: number): void {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 10_000_000) {
    throw new Error(_translateCopy('copy.55938514ff76', { defaultValue: 'Unsupported wallet encryption parameters. Your saved wallet has not been changed.' }));
  }
}
