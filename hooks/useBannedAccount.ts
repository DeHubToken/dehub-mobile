/**
 * Is the signed-in account banned?
 * =================================
 * A DeHub ban is read-only, not locked-out. The account keeps its sign-in, its
 * feed, its conversations, its notifications and everything else it can see,
 * until the person asks for the account to be deleted. What it loses is
 * writing: posting, commenting, reacting, following, messaging.
 *
 * The API enforces that itself — every write answers `403` with
 * `code: "ACCOUNT_BANNED"` — so this exists for the other half: saying so
 * before somebody types a post that was never going to send.
 */
import { useUser } from "../context/AuthContext";

export interface BannedAccountState {
  /** The signed-in account is banned. False while signed out. */
  isBanned: boolean;
  /** The moderator reason, when one was given. */
  bannedReason: string | null;
}

export function useBannedAccount(): BannedAccountState {
  const user = useUser();
  return {
    isBanned: Boolean(user?.isBanned),
    bannedReason: user?.bannedReason || null,
  };
}

/** True when an API error was a refusal because the account is banned. */
export function isAccountBannedError(error: unknown): boolean {
  const e = error as { errorCode?: string; code?: string } | null | undefined;
  return e?.errorCode === "ACCOUNT_BANNED" || e?.code === "ACCOUNT_BANNED";
}
