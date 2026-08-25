/**
 * Verified ENS handles — `/ens/*` on the DeHub API
 * ================================================
 * An account proves it holds a `.eth` name and is then also reachable at
 * `dehub.io/mal.eth`. Mirrors web's `src/lib/api/dehub/ens.ts`.
 *
 * Three things to know before touching the claim flow:
 *
 * **It is an alias, not a rename.** Nothing here writes `username`. Linking
 * adds a URL and a line on the profile; unlinking removes them; the account is
 * called the same thing throughout.
 *
 * **The signing wallet is usually not the session's wallet.** The signature has
 * to come from the address the name resolves to, which for most holders is a
 * different wallet from the one they browse DeHub with — and on this client
 * connecting a second wallet signs you IN as it (see EnsHandleSection for the
 * full trap). So the UI takes a pasted signature; it does not connect anything.
 *
 * **Nothing here is a lookup the client can shortcut.** Resolution and ENSIP-15
 * normalisation both happen server-side against Ethereum mainnet. A name typed
 * in the box is not a name until `preview()` says what it resolves to, and the
 * message to sign is never rebuilt on the client.
 *
 * Note the paths differ from web's by an `/api` prefix. `env.API_URL` already
 * ends in `/api`, so endpoints here are written without it, the way every other
 * service in this app writes them. Copying a path across from web verbatim
 * gives `/api/api/ens/…`, which 404s on every call.
 */

import { apiClient } from '../libs/api.client';

export interface EnsPreview {
  /** Canonical, ENSIP-15 normalised form — not necessarily what was typed. */
  name: string;
  /** The address the name currently points at, lowercased. */
  ensAddress: string;
  /** True when some DeHub account already wears it. */
  held: boolean;
  heldByUsername: string | null;
}

export interface EnsChallenge {
  name: string;
  ensAddress: string;
  /** Send this back with the signature — the server rebuilds the message from it. */
  issuedAt: number;
  expiresInSeconds: number;
  /** The exact text to sign. Never reconstruct it on the client. */
  message: string;
}

export interface EnsLink {
  name: string;
  ensAddress: string;
  verifiedAt: string;
  url: string;
}

/** Every endpoint answers `{ status, result }`; this unwraps it. */
interface Envelope<T> {
  status?: boolean;
  result: T;
  error?: string;
  code?: string;
}

/**
 * What the API called this failure.
 *
 * The claim flow has several failures worth wording differently — a name that
 * resolves to nothing, a signature from the wrong wallet, an expired challenge
 * — and they are only told apart by `code`.
 */
export class EnsApiError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'EnsApiError';
    this.code = code;
  }
}

function unwrap<T>(res: Envelope<T>): T {
  // `status` is absent on some success payloads and explicitly false on a
  // handled failure; only the second is an error.
  if (res && res.status === false) {
    throw new EnsApiError(res.error || 'Something went wrong', res.code);
  }
  return res?.result as T;
}

export const ensService = {
  /**
   * What a name resolves to, and whether it is free.
   *
   * Public on purpose: the box has to answer before anyone signs in, and this
   * reads mainnet, not the caller's account.
   */
  async preview(name: string): Promise<EnsPreview> {
    const res = await apiClient.fetch<Envelope<EnsPreview>>('/ens/preview', {
      isAuthRequired: false,
      params: { name },
    });
    return unwrap(res);
  },

  /**
   * A name to pre-fill, read off the signed-in wallet's reverse record.
   *
   * Usually null — the reverse record is a second, gas-costing transaction most
   * holders never send — so the claim box must work perfectly without one.
   */
  async suggest(): Promise<string | null> {
    const res = await apiClient.fetch<Envelope<{ name: string | null }>>('/ens/suggest');
    return unwrap(res)?.name ?? null;
  },

  /** The exact text to put in front of the wallet that holds the name. */
  async challenge(name: string): Promise<EnsChallenge> {
    const res = await apiClient.fetch<Envelope<EnsChallenge>>('/ens/challenge', {
      method: 'POST',
      body: { name },
    });
    return unwrap(res);
  },

  /** Hand back the signature and take the name. */
  async link(input: { name: string; issuedAt: number; signature: string }): Promise<EnsLink> {
    const res = await apiClient.fetch<Envelope<EnsLink>>('/ens/link', {
      method: 'POST',
      body: input,
    });
    return unwrap(res);
  },

  /** The name this account currently wears, or null. */
  async myLink(): Promise<EnsLink | null> {
    const res = await apiClient.fetch<Envelope<EnsLink | null>>('/ens/link');
    return unwrap(res) ?? null;
  },

  /** Drop it. The username is untouched — it was never replaced. */
  async unlink(): Promise<void> {
    await apiClient.fetch<Envelope<{ unlinked: boolean }>>('/ens/link', { method: 'DELETE' });
  },
};
