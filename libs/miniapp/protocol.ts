/**
 * The mini app wire protocol, the app side. A copy of dehubweb's
 * src/lib/miniapp/protocol.ts — keep the two in step — shared by the WebView host
 * (screens/MiniAppScreen.tsx) and the
 * SDK served at /sdk/miniapp.js. Pure functions only, so every rule about what
 * a third-party app may ask for is testable without a frame.
 *
 *   app  → host   { ns, v, id, method, params }
 *   host → app    { ns, v, id, result } | { ns, v, id, error: { code, message } }
 *   host → app    { ns, v, event, data }
 */

export const MINIAPP_NS = 'dehub-miniapp';
export const MINIAPP_PROTOCOL_VERSION = 1;

/** What the app host answers. The SDK's getCapabilities() returns exactly this. */
export const HOST_CAPABILITIES = [
  'ready',
  'close',
  'context',
  'auth.getToken',
  'actions.composePost',
  'actions.viewProfile',
  'actions.viewPost',
  'actions.openUrl',
  'haptics.impact',
] as const;

export type MiniAppMethod = (typeof HOST_CAPABILITIES)[number] | 'getCapabilities';

export interface MiniAppRequest {
  id: number;
  method: MiniAppMethod;
  params: Record<string, unknown>;
}

export type LaunchSource = 'store' | 'feed' | 'share' | 'dev' | 'direct';

export interface MiniAppContext {
  user: {
    wallet: string;
    handle: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  location: { type: LaunchSource };
  client: {
    platform: 'web' | 'mobile';
    locale: string;
    theme: 'dark' | 'light';
    safeAreaInsets: { top: number; bottom: number; left: number; right: number };
  };
}

const KNOWN_METHODS = new Set<string>([...HOST_CAPABILITIES, 'getCapabilities']);

/** A request from the frame, or null for anything that is not one. */
export function parseRequest(data: unknown): MiniAppRequest | null {
  let value = data;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const msg = value as Record<string, unknown>;
  if (msg.ns !== MINIAPP_NS) return null;
  if (typeof msg.id !== 'number' || !Number.isInteger(msg.id)) return null;
  if (typeof msg.method !== 'string' || !KNOWN_METHODS.has(msg.method)) return null;
  const params = msg.params && typeof msg.params === 'object' ? (msg.params as Record<string, unknown>) : {};
  return { id: msg.id, method: msg.method as MiniAppMethod, params };
}

export function reply(id: number, result: unknown) {
  return { ns: MINIAPP_NS, v: MINIAPP_PROTOCOL_VERSION, id, result };
}

export function replyError(id: number, code: string, message: string) {
  return { ns: MINIAPP_NS, v: MINIAPP_PROTOCOL_VERSION, id, error: { code, message } };
}

function isDehubHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'dehub.io' || h.endsWith('.dehub.io') || h === 'dehub.net' || h.endsWith('.dehub.net');
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost');
}

/**
 * The app URL a frame may load, or null.
 *
 * https only, except localhost in developer mode. Never a dehub origin: the
 * frame gets `allow-same-origin` so the app keeps its OWN origin (its storage,
 * its cookies, its API), and that is only safe because its origin is never
 * ours.
 */
export function parseAppUrl(raw: string, options: { dev?: boolean } = {}): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (isDehubHost(url.hostname)) return null;
  if (url.protocol === 'https:') return url;
  if (options.dev && url.protocol === 'http:' && isLocalHost(url.hostname)) return url;
  return null;
}

/** A dehub handle the app asked to open, or null. */
export function cleanHandle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const handle = value.trim().replace(/^@/, '');
  return /^[A-Za-z0-9_.-]{1,40}$/.test(handle) ? handle : null;
}

/** A dehub post id the app asked to open, or null. */
export function cleanPostId(value: unknown): string | null {
  const id = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  return /^\d{1,12}$/.test(id) ? id : null;
}

/** An external link the app asked to open: https only, never javascript: or data:. */
export function cleanExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export const COMPOSE_MAX = 500;

/** Composer text from a frame: printable characters and newlines, capped. */
export function cleanComposeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').slice(0, COMPOSE_MAX).trim();
}

/**
 * A link back into the app for a composed post. It must stay on the app's own
 * host, so an app cannot use the composer to push somebody else's URL.
 */
export function cleanEmbedUrl(value: unknown, appHost: string): string | null {
  const url = cleanExternalUrl(value);
  if (!url) return null;
  return new URL(url).hostname === appHost ? url : null;
}

/** The composer text for a composePost request. */
export function composeText(params: Record<string, unknown>, appHost: string): string {
  const text = cleanComposeText(params.text);
  const embed = cleanEmbedUrl(params.embedUrl, appHost);
  if (!embed) return text;
  return text ? `${text.slice(0, COMPOSE_MAX - embed.length - 1).trim()}\n${embed}` : embed;
}

/**
 * What a developer's wallet signs to prove it owns an app's domain. Must match
 * ownershipMessage() in supabase/functions/miniapp-registry byte for byte.
 */
export function ownershipMessage(domain: string): string {
  return `dehub mini app ownership\n${domain}`;
}
