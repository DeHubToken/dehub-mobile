/**
 * base58, the Bitcoin/Solana alphabet.
 *
 * Hand-rolled rather than taken from @solana/web3.js: both callers here — the
 * login proof and the derived-address cache — run on paths that must not pull
 * a 350 kB runtime in to encode 32 or 64 bytes.
 */

export const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';

  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  // Every leading zero byte encodes as a literal '1' and is invisible to the
  // arithmetic above, so it has to be counted separately.
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) leadingZeros++;

  let out = '1'.repeat(leadingZeros);
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58_ALPHABET[digits[i]];
  return out;
}
