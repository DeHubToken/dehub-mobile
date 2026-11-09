/**
 * Pictures from someone else's server load through our API, never straight
 * from the phone.
 *
 * A link's share image, or a GIF URL in a message, can sit on a server the
 * sender runs; loading it directly hands that server your IP address and
 * device. Through `/api/image-proxy` it only ever sees our server.
 * Same list as the web app (dehubweb src/lib/outside-image.ts).
 */
import env from "../config/env";

const DIRECT_HOSTS = [
  "dehubcdn.ams3.digitaloceanspaces.com",
  "dehubcdn.ams3.cdn.digitaloceanspaces.com",
  "dehub.io",
  "riftn.com",
  "supabase.co",
  "giphy.com",
  "tenor.com",
  "gstatic.com",
  "ytimg.com",
  "ggpht.com",
  "googleusercontent.com",
  // Spotify cover art (Spotify cards): Spotify's own CDN.
  "scdn.co",
  "spotifycdn.com",
];

const apiBase = (): string => (env.API_URL || "https://api.dehub.io/api").replace(/\/+$/, "");

function isDirectHost(host: string): boolean {
  const h = host.toLowerCase();
  return DIRECT_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

export function outsideImage(src: string): string;
export function outsideImage(src: string | null | undefined): string | undefined;
export function outsideImage(src: string | null | undefined): string | undefined {
  if (!src) return src ?? undefined;
  if (!/^https?:\/\//i.test(src)) return src; // file:, data:, relative
  if (src.includes("/image-proxy?url=")) return src;
  const m = src.match(/^https?:\/\/([^/?#:]+)/i);
  if (!m) return undefined;
  if (isDirectHost(m[1])) return src;
  // Keep our own API host direct too (staging/local builds).
  if (src.startsWith(apiBase())) return src;
  return `${apiBase()}/image-proxy?url=${encodeURIComponent(src)}`;
}
