/**
 * `.eth` handles — the one dotted path that is a person, not a file
 * =================================================================
 * A DeHub account can prove it holds an ENS name and then be reached at
 * `dehub.io/mal.eth` as well as at `dehub.io/mal`. The name is an **alias**:
 * `username` is untouched by it, which is why a `.eth` handle can never
 * collide with one — usernames may not contain a dot (see
 * `isReservedUsername` in libs/reserved-usernames.ts).
 *
 * Every "is this first segment a profile?" test has to know about the
 * carve-out, or the dot in `mal.eth` reads as a file extension and the link
 * resolves to nothing. dehubweb learned that the expensive way: its edge
 * worker made the same `!segment.includes('.')` judgement in four separate
 * places, and `dehub.io/mal.eth` unfurled as the homepage while the same
 * account at `dehub.io/mal` rendered a proper card.
 *
 * The mirror of this file on web is exported from `CLOUDFLARE_WORKER_SEO.js`
 * (`isEnsHandle` / `couldBeProfileSegment`), tested in
 * `src/test/ens-handle-routing.test.ts`. Keep the two in step — a link built
 * on one client is opened on the other.
 */

/** The only claimable suffix. See `couldBeProfileSegment` for why. */
export const ENS_SUFFIX = '.eth';

/**
 * True for something that looks like an ENS name we accept.
 *
 * Deliberately loose about what precedes the suffix. ENS names may be
 * non-ASCII, and by the time one arrives here it can still be percent-encoded
 * — a charset regex would reject exactly the names that most need this. A name
 * nobody holds still resolves to nothing, because `account_info` decides that,
 * not this function.
 *
 * `.eth` and nothing else. ENS also resolves imported DNS names, so accepting
 * any suffix would put `dehub.io` itself in the claimable set.
 */
export function isEnsHandle(segment: string | null | undefined): boolean {
  return (
    typeof segment === 'string' &&
    segment.length > ENS_SUFFIX.length &&
    segment.toLowerCase().endsWith(ENS_SUFFIX)
  );
}

/**
 * True when a single path segment can be somebody's profile.
 *
 * Two rejections, and the order matters: a reserved product path is never a
 * profile, and a dotted segment is a file — unless it is a `.eth` handle. The
 * dot test is load-bearing for every real static asset, so the carve-out stays
 * as narrow as it is.
 *
 * Comparison is case-insensitive because URL paths are typed by humans and web
 * route matching is case-insensitive too: `/Arcade` is the arcade, not the
 * profile `@Arcade`.
 */
export function couldBeProfileSegment(
  segment: string | null | undefined,
  reserved: Iterable<string>,
): boolean {
  if (!segment) return false;
  const lower = segment.toLowerCase();
  for (const entry of reserved) {
    if (entry.toLowerCase() === lower) return false;
  }
  return !segment.includes('.') || isEnsHandle(segment);
}

/**
 * The public URL a verified name gives an account.
 *
 * Built here rather than at each call site so the two profile headers and the
 * settings panel cannot drift on the shape of the thing they hand people.
 */
export function ensProfileUrl(name: string, origin = 'https://dehub.io'): string {
  return `${origin.replace(/\/+$/, '')}/${encodeURIComponent(name)}`;
}
