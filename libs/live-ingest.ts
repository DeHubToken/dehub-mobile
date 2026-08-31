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

import AsyncStorage from '@react-native-async-storage/async-storage';

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
 * Poster frame the provider renders for a running broadcast.
 *
 * Livepeer keeps one beside the HLS ladder and refreshes it as the stream
 * goes; the self-hosted server renders nothing, so a mediamtx stream answers
 * null and the caller has to fall back to whatever the post itself carries
 * rather than pointing an <Image> at a 404.
 *
 * Only worth asking for while the stream is actually live — once it ends the
 * URL 404s, so an ended stream must fall back too.
 */
export function liveThumbnailFor(stream: LiveStreamRef | null | undefined): string | null {
  const playbackId = stream?.playbackId;
  if (!playbackId) return null;
  if (liveProviderOf(stream) === 'mediamtx') return null;
  return `https://livepeercdn.studio/hls/${playbackId}/thumbnail.jpg`;
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
    // `/publish`, not `/whip`: nginx serves the same WHIP endpoint under both
    // names, and the client uses the one that on-device HTTPS filters do not
    // forge 403s for — every field 403 hit a URL containing /whip with zero
    // packets arriving anywhere server-side, while the same device's other
    // POSTs to the same hosts landed. The web app made the same move in
    // src/lib/live-ingest.ts.
    url: `https://${MEDIAMTX_HOST}/${stream.playbackId}/publish`,
    token: `dehub:${stream.streamKey ?? ''}`,
  };
}

/**
 * Whether this device can reach the self-hosted ingest at all.
 *
 * The ingest is a bare droplet IP — the one DeHub host not behind Cloudflare,
 * because WebRTC cannot ride the proxy — and some carriers null-route whole
 * hosting ranges, so a phone there connects to everything except this. The
 * failure is a silent packet drop, which fetch reports only by hanging, so
 * the probe caps its own wait. Any HTTP response at all, error status
 * included, proves the network path; only a network error or the timeout
 * says it is closed.
 *
 * Asked before minting so the stream can be created on Livepeer instead of
 * on a server this phone will never manage to send a byte to. The web app
 * runs the same probe in `src/lib/live-ingest.ts`.
 */
export async function probeIngestReachable(timeoutMs = 15_000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(`https://${MEDIAMTX_HOST}/`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Memory of the last direct connect that died on the network, because a
 * passing probe is not proof. The DPI-throttled carriers the probe exists
 * for intermittently let one small GET through while never carrying the
 * WHIP POST — a phone there passes the probe, mints self-hosted, and dies
 * seconds later, identically on every retry (observed three times in six
 * minutes from one phone on 2026-08-31). So a network-shaped failure of a
 * direct connect leaves a marker, the mint prefers Livepeer while one is
 * fresh, and a later successful direct connect clears it. AsyncStorage so
 * the marker survives the kill-and-retry loop a stuck creator actually
 * performs; every touch is wrapped because storage can be unavailable. The
 * web app mirrors this in `src/lib/live-ingest.ts`.
 */
const INGEST_FAILURE_KEY = 'dehub.ingest.unreachable-at';
const INGEST_FAILURE_WINDOW_MS = 24 * 3600 * 1000;

export async function markIngestUnreachable(): Promise<void> {
  try {
    await AsyncStorage.setItem(INGEST_FAILURE_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — the mint just falls back to trusting the probe */
  }
}

export async function clearIngestUnreachable(): Promise<void> {
  try {
    await AsyncStorage.removeItem(INGEST_FAILURE_KEY);
  } catch {
    /* nothing to clear where nothing could be written */
  }
}

export async function hadRecentIngestFailure(): Promise<boolean> {
  try {
    const at = Number(await AsyncStorage.getItem(INGEST_FAILURE_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < INGEST_FAILURE_WINDOW_MS;
  } catch {
    return false;
  }
}

/**
 * Signaling relay for the networks the probe above fails on.
 *
 * Rides api.dehub.io — Cloudflare-proxied and already reachable from the exact
 * phones whose direct WHIP never arrived (their API calls landed in the same
 * minute). nginx forwards ONLY /live-edge/{playbackId}/(whip|whep) to
 * MediaMTX's loopback signaling port; the media itself never passes through it,
 * so fronting a few KB of SDP text with the proxy is fine where fronting video
 * is not.
 *
 * Signaling alone moves nothing: a network that cannot reach the ingest for a
 * POST usually cannot carry UDP media to it either. The relay path is only
 * whole once fetchTurnServers() below returns a relay for the media leg. The
 * web app mirrors this in `src/lib/live-ingest.ts`.
 */
const EDGE_SIGNALING_BASE = 'https://api.dehub.io/live-edge';

export function edgeWhipEndpointFor(
  stream: LiveStreamRef | null | undefined,
): { url: string; token: string } | null {
  if (liveProviderOf(stream) !== 'mediamtx') return null;
  if (!stream?.playbackId) return null;
  return {
    // Same "/publish" naming as the direct host — the /whip path token is
    // what the on-device filters key on.
    url: `${EDGE_SIGNALING_BASE}/${stream.playbackId}/publish`,
    token: `dehub:${stream.streamKey ?? ''}`,
  };
}

/**
 * TURN relay servers for the media leg, or [] when no relay is deployed.
 *
 * The API answers with coturn REST credentials (expiry-stamp username, HMAC
 * credential, 6h TTL) and the relay URIs; an unconfigured backend answers an
 * empty list and callers skip the relay path entirely. Cached for the session
 * — the credential outlives any broadcast this launch will start, so asking
 * once keeps this safe to call at every decision point. A network failure
 * resets the cache and returns [] so the next caller retries; a lookup must
 * never break the direct path. AbortController rather than
 * AbortSignal.timeout, which Hermes does not ship (probeIngestReachable above
 * makes the same choice).
 */
let turnServersPromise: Promise<RTCIceServer[]> | null = null;

export function fetchTurnServers(): Promise<RTCIceServer[]> {
  if (!turnServersPromise) {
    turnServersPromise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch('https://api.dehub.io/api/live/turn-credentials', {
          signal: controller.signal,
        });
        if (!res.ok) return [];
        const body = (await res.json()) as { iceServers?: RTCIceServer[] };
        return Array.isArray(body.iceServers) ? body.iceServers : [];
      } catch {
        turnServersPromise = null;
        return [];
      } finally {
        clearTimeout(timer);
      }
    })();
  }
  return turnServersPromise;
}

/**
 * The failure shapes that mean the network ate the request — the fetch died
 * without a response (React Native surfaces that as a TypeError) or aborted
 * on a cap — as opposed to a bad status the server actually sent. Shared so
 * the unreachable marker and any error copy key off the same definition.
 */
export function isNetworkShapedError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError' || error instanceof TypeError;
}
