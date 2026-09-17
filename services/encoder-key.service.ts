/**
 * Permanent encoder credentials — `/live/ingest-key` on the DeHub API
 * ===================================================================
 * Mirrors web's `getEncoderCredentials` in `src/lib/api/dehub/livestream.ts`.
 *
 * Every other stream key on the self-hosted ingest is minted per broadcast,
 * along with the path it publishes to, and handed over in the mint response.
 * That is right for a broadcast started in the app and unusable for anything
 * else: OBS, a capture app and a console are configured once, by hand, often
 * with a controller on a TV. Re-keying one before every session is why people
 * ended up creating a live post purely to get a key out of it.
 *
 * So these never change. The creator pastes them in once, presses Start in
 * their encoder, and the post is created when the broadcast actually arrives.
 *
 * Note the paths carry no `/api` prefix — `env.API_URL` already ends in one,
 * and copying web's path across verbatim gives `/api/api/live/…`, which 404s.
 */

import { apiClient } from '../libs/api.client';

export interface EncoderCredentials {
  /** The encoder's "Server" field. */
  server: string;
  /** Its "Stream Key" field. Secret — this is the publish credential. */
  streamKey: string;
  /** The two joined, for one-line copy. */
  ingestUrl: string;
  /** Title a broadcast started from the encoder is posted under. */
  defaultTitle: string;
}

const EMPTY: EncoderCredentials = { server: '', streamKey: '', ingestUrl: '', defaultTitle: '' };

/**
 * These routes answer the BARE object, with no `{ result }` envelope — the
 * same shape `/live/:id/ingesturl` has, which cost dehubweb#1516 a blank
 * Server field when it was read as an enveloped one. Both are accepted here
 * rather than betting on which.
 */
function normalise(res: any): EncoderCredentials {
  const body = res && typeof res === 'object' && res.result && typeof res.result === 'object'
    ? res.result
    : res;
  return {
    server: body?.server || '',
    streamKey: body?.streamKey || '',
    ingestUrl: body?.ingestUrl || '',
    defaultTitle: body?.defaultTitle || '',
  };
}

export const encoderKeyService = {
  /**
   * The creator's pair, minted on first ask.
   *
   * An account without livestreaming, or an API that predates the route, comes
   * back empty so the panel can say "not available" rather than showing an
   * error nobody can act on.
   */
  async get(): Promise<EncoderCredentials> {
    try {
      return normalise(await apiClient.fetch<any>('/live/ingest-key'));
    } catch {
      return EMPTY;
    }
  },

  /** Issue a new key. The server address is unchanged — only the secret moves. */
  async rotate(): Promise<EncoderCredentials> {
    return normalise(await apiClient.fetch<any>('/live/ingest-key/rotate', { method: 'POST' }));
  },

  async setDefaultTitle(defaultTitle: string): Promise<EncoderCredentials> {
    return normalise(
      await apiClient.fetch<any>('/live/ingest-key', {
        method: 'PATCH',
        body: { defaultTitle },
      }),
    );
  },
};

export default encoderKeyService;
