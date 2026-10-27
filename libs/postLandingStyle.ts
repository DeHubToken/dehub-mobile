/**
 * How a new post of your own lands in the Home feed once you press Post.
 * Chosen in Settings → Appearance; `ghost` unless the viewer picks another.
 *
 * - ghost: the composer slides away, the feed eases down to open a slot at
 *   the top and the post fades into it.
 * - morph: the composer itself shrinks into the post's card.
 * - pill: the upload pill fills, then opens out into the card once the post
 *   is up.
 * - drop: the card drops in from the header with a small bounce.
 *
 * Kept apart from libs/postLanding so the preferences module can read the
 * type without pulling in the animation runtime.
 */
export type PostLandingStyle = 'ghost' | 'morph' | 'pill' | 'drop';

export const POST_LANDING_STYLES: readonly PostLandingStyle[] = ['ghost', 'morph', 'pill', 'drop'];

export function isPostLandingStyle(value: unknown): value is PostLandingStyle {
  return typeof value === 'string' && (POST_LANDING_STYLES as readonly string[]).includes(value);
}
