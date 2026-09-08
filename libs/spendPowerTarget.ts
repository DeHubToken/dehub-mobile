/**
 * Resolving the target a SuperPower acts on
 * =========================================
 * Mirror of web's `src/lib/spend-power-target.ts` — the pure half of
 * `SpendPowerSheet`, kept out of the component so the two rules can be tested
 * without a React tree, a wallet or a Supabase client.
 *
 * Everything here is advisory. The API's `superpower.service.ts` re-checks each
 * rule and its refusal is the authority; these exist so a person is not offered
 * a choice that is going to be refused, which is the whole complaint the sheet
 * was built to answer.
 */

import type { SuperPowerKey } from "../services/superpower.service";

/** The Boost/Second Wind line, and the only age rule on the ladder. */
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Stages that still have a rail to be the top of. Mirrors
 * `FRONT_ROW_STAGE_STATUSES` on the server — an ended Stage would take the
 * allowance and show nothing for it.
 */
export const FRONT_ROW_STATUSES = ["live", "scheduled"];

/**
 * A post id out of whatever was pasted.
 *
 * Accepts a full URL, a bare path and the number on its own, because all three
 * are things people actually have in the clipboard. Returns null for anything
 * else, which is what lets one box double as a search field: null means "this
 * is a search term", a number means "this is a link to one post".
 */
export function postIdFromInput(raw: string): number | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/\/post\/(\d+)/);
  return match ? Number(match[1]) : null;
}

/**
 * Whether this power can act on a post of this age.
 *
 * Only the Boost/Second Wind pair has an age rule — they split one job by age,
 * which is why Second Wind sits a rung higher. Every other power passes, and an
 * unreadable or absent date passes too: hiding a post because its timestamp did
 * not parse is worse than offering one the server will politely refuse.
 */
export function ageSuits(key: SuperPowerKey | undefined, createdAt: string | undefined): boolean {
  if (key !== "boost" && key !== "second_wind") return true;
  if (!createdAt) return true;
  const age = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(age)) return true;
  return key === "second_wind" ? age > WEEK_MS : age <= WEEK_MS;
}
