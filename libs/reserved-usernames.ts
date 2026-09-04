/**
 * Usernames nobody may claim.
 *
 * Web profiles resolve at dehub.io/:username, which is the last route in that
 * router — every static path above it wins, and the edge worker takes more
 * before React boots. A username matching one of those is a profile that
 * cannot be opened on the web at all, and a product URL held by whoever
 * registered first. That is a web routing rule, but it binds here too: the
 * mobile app writes to the same accounts, so a name claimed on a phone breaks
 * the same URL. Five handles are already held this way (`admin`, `explore`,
 * `creators`, `wallet`, `blog`).
 *
 * The canonical copy of this list lives in dehubweb at
 * src/lib/reserved-usernames.js, where the router and the edge worker both
 * read it. It cannot be imported across repos, so this is a deliberate mirror
 * — when a route is added there, add it here. Content is kept in the same
 * order and grouping to make the two easy to diff.
 *
 * IMPORTANT: this is a client guard only. `/api/username/check` reports these
 * names as available and `/api/update_profile` accepts them, so a direct call
 * still claims one. The server-side rule is the real fix.
 */

/** Paths that really exist on the web app: router, /app children, edge, redirects. */
const ROUTE_SEGMENTS = [
  // SPA top-level routes
  "accounts", "admin", "admin-manual", "affiliate", "agents", "apk", "app", "arcade", "assistant",
  "auth", "bounty", "bridge", "builder", "cinema", "communities", "connect", "converter",
  "creator", "creators",
  "delete-account", "depin", "docs", "editor", "events", "explore", "features",
  "governance", "guide", "guides", "jobs", "launchpad", "leaderboard",
  "mcp", "mobile-preview", "music", "newpost", "posts", "premium", "pricing", "prompt", "r",
  "radio", "raffle", "shorts", "stage", "stages", "stake", "stats", "top-100", "tv",
  "usernames", "videos", "work", "yt-dlp",

  // /app children — the worker collapses /app/<x> onto /<x>
  "ads", "bookmarks", "buy", "command-centre", "fractions", "glossary", "messages",
  "migrate-youtube", "notifications", "post", "profile", "settings", "stores",
  "superpowers", "upload", "video", "wallet",

  // Edge-only surfaces
  "blog", "rss", "sitemap", "robots",

  // Worker redirect tables
  "legal", "privacy", "privacy-policy", "terms", "terms-of-service",
];

/** Not routes, but a profile at any of these reads as DeHub speaking. */
const RESERVED_VANITY_NAMES = [
  // "accounts" moved to ROUTE_SEGMENTS when the account marketplace shipped.
  "about", "account", "api", "billing", "contact", "dehub",
  "help", "home", "login", "logout", "me", "moderator", "official",
  "register", "root", "security", "signin", "signup", "staff", "status",
  "support", "system", "team", "undefined", "null",
];

export const RESERVED_USERNAMES = new Set<string>([
  ...ROUTE_SEGMENTS,
  ...RESERVED_VANITY_NAMES,
]);

/**
 * Paths that are never a username when a single-segment link is resolved.
 *
 * Three lists used to answer this question and they had drifted badly apart:
 * this file's 94, a 14-entry list in navigation/linking.config.ts, and a
 * 48-entry one in libs/dehub-links.ts. The deep-link list was missing 84 of
 * these, so tapping dehub.io/docs, /music, /shorts, /tv, /work, /explore,
 * /settings, /wallet, /messages, /leaderboard or /governance opened a profile
 * sheet for a user who does not exist.
 *
 * Everything reserved as a username belongs here, plus the entries that are
 * routing-only and have no business being username reservations:
 *
 *   stream, feeds, welcome  product paths with no profile behind them
 *   auth-callback           the OAuth redirect target
 *   dpay                    a product path the link-card checker already knew
 *                           (`bounty` used to sit here too; it is a reserved
 *                           username now, so it comes in with the set above)
 *   robots.txt, sitemap.xml, skill.md
 *                           web files; harmless here and cheaper than
 *                           remembering why they were special
 */
export const RESERVED_LINK_SEGMENTS = new Set<string>([
  ...RESERVED_USERNAMES,
  "stream",
  "feeds",
  "welcome",
  "auth-callback",
  "dpay",
  "robots.txt",
  "sitemap.xml",
  "skill.md",
]);

/**
 * Stored usernames are lowercase, but input arrives with an `@`, with padding
 * and — from the edit screen, whose TextInput was unfiltered — in mixed case.
 * Web router matching is case-insensitive, so `App` collides with /app exactly
 * as `app` does.
 */
export function normalizeUsername(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/^@+/, "").toLowerCase();
}

/**
 * True when `value` may not be claimed. Only ever call this on a name the user
 * is trying to TAKE — an existing holder of a name that later became reserved
 * must still be able to edit the rest of their profile.
 */
export function isReservedUsername(value: string | null | undefined): boolean {
  const name = normalizeUsername(value);
  if (!name) return false;
  if (RESERVED_USERNAMES.has(name)) return true;
  // A dotted name is read as a file by the web edge worker, never a profile —
  // and this stays true even now that dehub.io/mal.eth resolves. A verified ENS
  // name is an ALIAS stored in accounts.ensName, proved with a signature from
  // the address it points at; it is never a username, and admitting a dot here
  // would let anyone TYPE `vitalik.eth` into the edit-profile box and claim it.
  // See libs/ens-handle.ts for the routing side of the same rule.
  if (name.includes(".")) return true;
  // /app/<x> twins reach the same URL space from two directions.
  if (name.startsWith("app-") || name.startsWith("app_")) return true;
  return false;
}
