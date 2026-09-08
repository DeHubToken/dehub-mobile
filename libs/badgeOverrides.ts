/**
 * Badges granted by name rather than earned by balance
 * ====================================================
 * A short list of accounts render a badge the ladder does not give them. The
 * list originates in web's `USERNAME_BADGE_OVERRIDES`
 * (`dehubweb/src/lib/staking-badges.ts`) and is mirrored on the API in
 * `dehub-stream-backend/src/badge/badge-overrides.ts`, which is the copy that
 * actually decides what a granted account's reaction is worth.
 *
 * Two copies of this table already existed here — one in `postQuota.ts`, one in
 * `profileLimits.ts` — because each needed it and neither wanted to own it.
 * This is that table, once.
 *
 * **A grant decides the badge as well as the allowance.** `getBadgeName` in
 * `libs/misc.ts` reads this table before it reads the ladder, matching web's
 * `getBadgeName`, which has always done so. It deliberately did not here, on
 * the reasoning that an allowance change should not restyle badges — but the
 * two apps then drew different badges for the same account, which is the
 * louder bug: a granted holder wore their tier on the website and their
 * balance's tier in the app.
 *
 * The API applies the grant to reactions and views, so `useEngagementWeight`
 * has to as well or the optimistic count moves by the wrong amount and settles
 * a frame later — which is the bug that put the table on the server in the
 * first place, in the other direction.
 */

/**
 * Accounts granted a tier by username, keyed lowercase without the `@`.
 *
 * A `Map` rather than an object literal so a handle that collides with
 * something on `Object.prototype` (`constructor`, `toString`) cannot resolve
 * to a tier nobody granted.
 */
export const USERNAME_BADGE_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ["maldoteth", "Meglodon"],
  ["mal", "Meglodon"],
  ["aaron", "Meglodon"],
]);

/** The tier this username is granted, or undefined when it is not listed. */
export function overrideTierNameFor(
  username: string | null | undefined,
): string | undefined {
  if (typeof username !== "string") return undefined;
  const key = username.replace("@", "").trim().toLowerCase();
  if (!key) return undefined;
  return USERNAME_BADGE_OVERRIDES.get(key);
}
