/**
 * Where a given live stream's bytes come from.
 *
 * DeHub runs two ingests. Livepeer is the original; a self-hosted MediaMTX is
 * the cheap one — Livepeer bills delivery per viewer-hour, the only part of the
 * streaming bill that grows with an audience.
 *
 * The provider is read off the STREAM, never off the build. A stream carries
 * its provider on its own document, so a cutover in either direction leaves
 * anything already broadcasting exactly where it is. Streams that predate the
 * field have none and are Livepeer by definition — which is why the fallback
 * here is a constant, not a config value.
 *
 * The web app mirrors this in `src/lib/live-ingest.ts`. The two must agree:
 * they resolve the same streams for the same users.
 */

export type LiveProvider = 'livepeer' | 'mediamtx';

/**
 * Host of the self-hosted ingest.
 *
 * A plain constant rather than an `@env` value on purpose. It is a public
 * hostname, not a secret, and changing it needs a new binary either way —
 * routing it through react-native-dotenv would add a codegen step and a
 * rebuild for no benefit the constant does not already give.
 */
const MEDIAMTX_HOST = 'live.dehub.io';

/** Just enough of a stream to resolve its URLs. */
export interface LiveStreamRef {
  provider?: string | null;
  playbackId?: string | null;
  streamKey?: string | null;
}

export function liveProviderOf(stream: LiveStreamRef | null | undefined): LiveProvider {
  return stream?.provider === 'mediamtx' ? 'mediamtx' : 'livepeer';
}

/** HLS ladder — what the player pulls. */
export function hlsUrlFor(stream: LiveStreamRef | null | undefined): string | null {
  const playbackId = stream?.playbackId;
  if (!playbackId) return null;
  return liveProviderOf(stream) === 'mediamtx'
    ? `https://${MEDIAMTX_HOST}/${playbackId}/index.m3u8`
    : `https://livepeercdn.studio/hls/${playbackId}/index.m3u8`;
}

/**
 * WHIP publish endpoint, and the credential the self-hosted path needs.
 *
 * The two providers address a broadcast differently and it is not a detail:
 * Livepeer names it by the SECRET stream key and answers with a redirect to a
 * regional node, while the self-hosted server names it by the PUBLIC
 * playbackId and takes the key as a credential instead. A path every viewer
 * can read is not a secret to publish against, so the key travels in a header
 * where it stays out of access logs.
 *
 * Returning null means "use the Livepeer path", which is the caller's default.
 */
export function whipEndpointFor(
  stream: LiveStreamRef | null | undefined,
): { url: string; token: string } | null {
  if (liveProviderOf(stream) !== 'mediamtx') return null;
  if (!stream?.playbackId) return null;
  return {
    url: `https://${MEDIAMTX_HOST}/${stream.playbackId}/whip`,
    token: `dehub:${stream.streamKey ?? ''}`,
  };
}
