/**
 * Writing down a bounty payout that has already happened.
 *
 * The transfer goes out of the poster's wallet first and the row that records
 * it is written second, because the row wants the transaction hash. Those two
 * steps can come apart: the transfer lands, the Supabase write fails, and the
 * app has no memory of a payment that is already on chain. The screen then
 * shows the submission as approved-but-unpaid with a Pay button on it, and the
 * honest thing for a poster to do at that point — press it again — sends the
 * money twice.
 *
 * So a write that follows a settled transfer is retried, and if it still will
 * not land the failure says what actually happened. "Payment failed" would be
 * a lie that costs the poster the amount a second time.
 */

import i18n from "i18next";

/** Thrown when the money moved but the row recording it would not save. */
export class PaidButUnrecordedError extends Error {
  readonly txHash: string;

  constructor(txHash: string) {
    super(paidButUnrecordedMessage(txHash));
    this.name = "PaidButUnrecordedError";
    this.txHash = txHash;
  }
}

/**
 * Keep the words "already sent" and "Do not pay again" — this is read in a
 * toast by someone deciding whether to press Pay a second time, and it is the
 * only thing standing between them and doing it.
 *
 * Which is exactly why it is translated. It was hardcoded English, so for a
 * reader of any of the other 109 languages the one sentence stopping a second
 * payout was in a language they may not read, on a screen whose other half is
 * in theirs.
 *
 * The i18next singleton is imported directly, not our i18n/index module and
 * not the hook: this is a plain module with no component around it, and the
 * message is built inside an Error constructor. i18n/index pulls in
 * expo-localization, which does not load under jest and would take this
 * module's whole suite down; i18next is the same instance that module
 * configures. If it has not initialised yet the defaultValue below is the old
 * English text, so the worst case is the previous behaviour.
 */
export function paidButUnrecordedMessage(txHash: string): string {
  const short = txHash.length > 14 ? `${txHash.slice(0, 8)}…${txHash.slice(-6)}` : txHash;
  // English text, and the value en.json carries. Kept as a literal fallback
  // because i18next returns undefined for any key before it has initialised,
  // defaultValue included — and a payout warning must never be blank.
  const english =
    `Payment already sent (${short}). Do not pay again — reopen the job shortly and it should show as paid.`;
  return i18n.t("work.payout.alreadySent", { ref: short, defaultValue: english }) || english;
}

export interface PersistPayoutOptions {
  /** Total tries, first one included. */
  attempts?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run the row write, retrying while it fails.
 *
 * `write` returns Supabase's `{ error }` rather than throwing, and may also
 * throw outright if the request itself dies — both count as a failed attempt.
 *
 * With a hash in hand the final failure becomes a PaidButUnrecordedError, so
 * the toast tells the poster the money is gone rather than inviting a second
 * transfer. Without one nothing was spent, and the underlying error is the
 * more useful thing to surface.
 */
export async function persistPayout(
  // PromiseLike, not Promise: a Supabase query builder is a thenable that only
  // fires when it is awaited, and each retry has to build a fresh one — an
  // already-awaited builder does not run twice.
  write: () => PromiseLike<{ error?: unknown } | void>,
  txHash: string | null,
  options: PersistPayoutOptions = {},
): Promise<void> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const delayMs = options.delayMs ?? 700;
  const sleep = options.sleep ?? defaultSleep;

  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await write();
      const error = result && typeof result === "object" ? (result as { error?: unknown }).error : undefined;
      if (!error) return;
      last = error;
    } catch (err) {
      last = err;
    }
    if (attempt < attempts) await sleep(delayMs * attempt);
  }

  if (txHash) throw new PaidButUnrecordedError(txHash);
  throw last instanceof Error ? last : new Error(String((last as any)?.message || last || "Could not save the payout"));
}
