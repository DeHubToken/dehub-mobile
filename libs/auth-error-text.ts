import i18n from "i18next";

/**
 * What to show for a failed sign-in step. Supabase, the code-sending
 * functions and the OS sign-in sheets answer in English ("Token has expired or
 * is invalid"), so outside English the reader gets the translated fallback
 * instead. Same rule as dehubweb's authErrorText.
 */
export function serverAuthText(message: unknown, fallback: string): string {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return fallback;
  const language = i18n.resolvedLanguage || i18n.language || "en";
  return language === "en" || language.startsWith("en-") ? text : fallback;
}

/**
 * Closing the Google, Apple or Telegram sheet is a choice, not a failure, and
 * gets no red notice. Apple spells it "canceled" (ERR_REQUEST_CANCELED); the
 * browser flows here throw "... sign-in was cancelled"; Web3Auth's old-account
 * login says "login flow failed with error type dismiss".
 */
export function isSignInCancelled(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (e?.code === "ERR_REQUEST_CANCELED" || e?.code === "ERR_CANCELED") return true;
  return typeof e?.message === "string" && /\bcancell?ed\b|error type (dismiss|cancel)/i.test(e.message);
}
