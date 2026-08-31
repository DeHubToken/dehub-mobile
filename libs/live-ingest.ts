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
export async function probeIngestReachable(timeoutMs = 4000): Promise<boolean> {
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
 * The failure shapes that mean the network ate the request — the fetch died
 * without a response (React Native surfaces that as a TypeError) or aborted
 * on a cap — as opposed to a bad status the server actually sent. Shared so
 * the unreachable marker and any error copy key off the same definition.
 */
export function isNetworkShapedError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError' || error instanceof TypeError;
}
