/**
 * Supabase fallback through the apex relay.
 *
 * The project host sits on Cloudflare addresses, and some networks black-hole
 * those (see ROUTING-RECOVERY.md in dehubweb). dehub.io resolves to our own
 * nginx, which forwards `/_sb/<path>` to the project unchanged, so a client that
 * cannot reach Supabase directly can still refresh its session, read rows and
 * load storage through the website hostname.
 *
 * Same rules as the API fallback in api.client.ts: direct first, and only a
 * request that is safe to send twice is replayed after a transport failure.
 * An HTTP error status is an answer, not a routing problem, and never switches
 * route. Once direct has failed, every Supabase request (writes included — a
 * first send, not a replay) goes through the relay for RELAY_WINDOW_MS, then
 * direct is probed again. Realtime websockets do not pass through fetch and
 * are not covered.
 */
import env from '../config/env';
import { createLogger } from './logger';

const log = createLogger('SupabaseRelay');

// The relay forwards to this project only, so a build pointed anywhere else
// never uses it.
const RELAY_PROJECT_URL = 'https://aigxuutjaqsywioxjefr.supabase.co';
const DIRECT_BASE_URL = (env.SUPABASE_URL || '').replace(/\/+$/, '');
const RELAY_BASE_URL = `${(env.APP_ORIGIN || 'https://dehub.io').replace(/\/+$/, '')}/_sb`;
const RELAY_ENABLED = DIRECT_BASE_URL === RELAY_PROJECT_URL;

export const RELAY_WINDOW_MS = 10 * 60 * 1000;

/**
 * React Native's Android client has no connect timeout, so a black-holed
 * address leaves fetch pending for minutes and the fallback never gets a
 * failure to react to. Reads get a ceiling on the time to response headers;
 * REST and storage answer well inside it (the database's own statement timeout
 * is shorter). Edge functions and writes keep the platform behaviour: a slow
 * one may still be running server-side, and aborting it gains nothing we can
 * safely replay.
 */
const DIRECT_READ_DEADLINE_MS = 15_000;

let relayUntil = 0;
// Set when the relay answered with something that is not Supabase (before the
// web side ships `/_sb`, the SPA catch-all serves index.html there). While set,
// a direct failure stays a plain failure instead of routing into a dead end.
let relayUnusableUntil = 0;

function readUrl(input: RequestInfo | URL): string | null {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.toString();
  return null;
}

function reusableBody(body: BodyInit | null | undefined): boolean {
  return body == null ||
    typeof body === 'string' ||
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) ||
    (typeof Blob !== 'undefined' && body instanceof Blob);
}

function canReplay(path: string, init?: RequestInit): boolean {
  if (!reusableBody(init?.body)) return false;
  const method = (init?.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return true;
  // A refresh-token grant is the one POST worth replaying: without it the
  // session dies while direct is unreachable. GoTrue accepts the same refresh
  // token again within its reuse interval and returns the session it already
  // issued, rather than treating the second use as token theft and revoking
  // the family. No deadline is applied to it (see above), so a replay follows
  // a failed send, not a slow one.
  return method === 'POST' && /^\/auth\/v1\/token\?(?:.*&)?grant_type=refresh_token(?:&|$)/.test(path);
}

/** The gateway stamps every response, errors included; the SPA and nginx's own error pages do not. */
function fromSupabase(res: Response): boolean {
  return Boolean(res?.headers?.get?.('sb-project-ref') || res?.headers?.get?.('sb-request-id'));
}

function directFailed(path: string, err: unknown) {
  const now = Date.now();
  if (now < relayUnusableUntil) return;
  if (now >= relayUntil) log.warn('direct Supabase unreachable, using relay', { path: path.split('?', 1)[0] }, err);
  relayUntil = now + RELAY_WINDOW_MS;
}

function relayFailed(path: string) {
  log.warn('relay did not answer as Supabase, staying direct', { path: path.split('?', 1)[0] });
  relayUntil = 0;
  relayUnusableUntil = Date.now() + RELAY_WINDOW_MS;
}

export function createSupabaseRelayFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = readUrl(input);
    if (!RELAY_ENABLED || !url || !url.startsWith(`${DIRECT_BASE_URL}/`)) return baseFetch(input, init);
    const path = url.slice(DIRECT_BASE_URL.length);
    const relayUrl = RELAY_BASE_URL + path;
    const signal = init?.signal ?? undefined;
    const replayable = canReplay(path, init);

    if (Date.now() < relayUntil) {
      let relayError: unknown;
      try {
        const res = await baseFetch(relayUrl, init);
        if (fromSupabase(res)) return res;
        relayFailed(path);
        relayError = new TypeError('Network request failed');
      } catch (err) {
        relayError = err;
      }
      // The relay answer is unusable or never came. A read can still try
      // direct once; a write may have reached the project, so it fails as is.
      if (!replayable || signal?.aborted) throw relayError;
      const res = await baseFetch(url, init);
      relayUntil = 0;
      return res;
    }

    let directInit = init;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const method = (init?.method || 'GET').toUpperCase();
    if ((method === 'GET' || method === 'HEAD') && !path.startsWith('/functions/')) {
      const controller = new AbortController();
      if (signal?.aborted) controller.abort();
      else signal?.addEventListener?.('abort', () => controller.abort(), { once: true });
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, DIRECT_READ_DEADLINE_MS);
      directInit = { ...init, signal: controller.signal };
    }

    try {
      return await baseFetch(url, directInit);
    } catch (caught) {
      // A caller's own cancel is not a routing problem.
      if (signal?.aborted && !timedOut) throw caught;
      // Our deadline reads as an AbortError, which callers treat as their own
      // cancel. Surface it as the network failure it is.
      const err = timedOut ? new TypeError('Network request timed out') : caught;
      directFailed(path, err);
      if (!replayable || Date.now() < relayUnusableUntil) throw err;
      try {
        const res = await baseFetch(relayUrl, init);
        if (fromSupabase(res)) return res;
        relayFailed(path);
      } catch (relayErr) {
        if (signal?.aborted) throw relayErr;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
}
