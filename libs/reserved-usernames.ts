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
  "admin", "affiliate", "agents", "apk", "app", "arcade", "assistant",
  "auth", "bridge", "builder", "cinema", "communities", "connect", "creator", "creators",
  "delete-account", "depin", "docs", "editor", "events", "explore", "features",
  "governance", "guide", "guides", "jobs", "launchpad", "leaderboard",
  "mcp", "mobile-preview", "music", "premium", "pricing", "prompt", "r",
  "radio", "shorts", "stage", "stages", "stake", "stats", "top-100", "tv",
  "usernames", "videos", "work",

  // /app children — the worker collapses /app/<x> onto /<x>
  "ads", "bookmarks", "buy", "command-centre", "glossary", "messages",
  "notifications", "post", "profile", "settings", "stores", "video", "wallet",

  // Edge-only surfaces
  "blog", "rss", "sitemap", "robots",

  // Worker redirect tables
  "legal", "privacy", "privacy-policy", "terms", "terms-of-service",
];

/** Not routes, but a profile at any of these reads as DeHub speaking. */
const RESERVED_VANITY_NAMES = [
  "about", "account", "accounts", "api", "billing", "contact", "dehub",
  "help", "home", "login", "logout", "me", "moderator", "official",
  "register", "root", "security", "signin", "signup", "staff", "status",
  "support", "system", "team", "undefined", "null",
];

export const RESERVED_USERNAMES = new Set<string>([
  ...ROUTE_SEGMENTS,
  ...RESERVED_VANITY_NAMES,
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
  // A dotted name is read as a file by the web edge worker, never a profile.
  if (name.includes(".")) return true;
  // /app/<x> twins reach the same URL space from two directions.
  if (name.startsWith("app-") || name.startsWith("app_")) return true;
  return false;
}
