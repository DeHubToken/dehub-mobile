/**
 * The exact text a wallet signs to prove it belongs to a DeHub account.
 *
 * The API rebuilds this string byte-for-byte from the address and timestamp it
 * is sent, and verifies the signature against the result — so a stray space or
 * a reworded line here does not produce a helpful error, it produces "invalid
 * signature", which reads as a wallet problem and is not one. It mirrors
 * `buildLoginMessage` in the backend's `common/util/auth.ts`.
 *
 * It lives in its own module because a second key now signs it: Phantom's
 * Solana account countersigns the same message to prove itself, both at login
 * and when linking from Settings. Three hand-written copies of a signed string
 * would be three chances to drift.
 */

/** How long the API considers a login signature good for. Mirrors `expireSecond`. */
export const LOGIN_SIGNATURE_TTL_HOURS = 24;

export function buildDeHubLoginMessage(address: string, timestampSeconds: number): string {
  const displayedDate = new Date(timestampSeconds * 1000);
  return (
    `Welcome to DeHub!\n\nClick to sign in for authentication.\n` +
    `Signatures are valid for ${LOGIN_SIGNATURE_TTL_HOURS} hours.\n` +
    `Your wallet address is ${address.toLowerCase()}.\n` +
    `It is ${displayedDate.toUTCString()}.`
  );
}
