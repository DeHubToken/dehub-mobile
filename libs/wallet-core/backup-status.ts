// Whether the user has saved their wallet's 12 words, and how often they have
// waved the reminder away. Shared with dehubweb through the same Supabase
// table (RLS: the caller's own row only), so backing up on one client quiets
// the reminder on the other.
//
// Nothing here may break the screen it is called from: every failure is
// logged and swallowed. A read that fails returns null, which callers treat
// as "say nothing" rather than "not backed up".
import { supabase } from "../../services/supabase";
import { createLogger } from "../logger";

const log = createLogger("wallet-core/backup-status");

const TABLE = "wallet_backup_status";

export interface BackupStatus {
  backedUpAt: string | null;
  remindersDismissed: number;
  lastDismissedAt: string | null;
}

// wallet_backup_status is not in the generated Supabase types.
function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any;
}

const NOT_BACKED_UP: BackupStatus = { backedUpAt: null, remindersDismissed: 0, lastDismissedAt: null };

/**
 * The row is keyed on the user, not the wallet. A row written for a wallet the
 * user has since replaced says nothing about the current one, so it reads as
 * not backed up and never dismissed.
 */
export function parseBackupStatusRow(
  row: Record<string, unknown> | null | undefined,
  ethAddress: string
): BackupStatus {
  if (!row) return { ...NOT_BACKED_UP };
  const rowAddress = typeof row.eth_address === "string" ? row.eth_address : "";
  if (rowAddress.toLowerCase() !== ethAddress.toLowerCase()) return { ...NOT_BACKED_UP };
  const dismissed = Number(row.reminders_dismissed);
  return {
    backedUpAt: typeof row.backed_up_at === "string" ? row.backed_up_at : null,
    remindersDismissed: Number.isFinite(dismissed) && dismissed > 0 ? dismissed : 0,
    lastDismissedAt: typeof row.last_dismissed_at === "string" ? row.last_dismissed_at : null,
  };
}

export async function getBackupStatus(userId: string, ethAddress: string): Promise<BackupStatus | null> {
  if (!userId || !ethAddress) return null;
  try {
    const { data, error } = await db()
      .from(TABLE)
      .select("eth_address, backed_up_at, reminders_dismissed, last_dismissed_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return parseBackupStatusRow(data, ethAddress);
  } catch (e) {
    log.warn("get:failed", e);
    return null;
  }
}

async function upsert(userId: string, fields: Record<string, unknown>): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    const { error } = await db()
      .from(TABLE)
      .upsert({ user_id: userId, ...fields, updated_at: now }, { onConflict: "user_id" });
    if (error) throw error;
    return true;
  } catch (e) {
    log.warn("upsert:failed", e);
    return false;
  }
}

export async function markBackedUp(userId: string, ethAddress: string): Promise<boolean> {
  if (!userId || !ethAddress) return false;
  return upsert(userId, {
    eth_address: ethAddress.toLowerCase(),
    backed_up_at: new Date().toISOString(),
    reminders_dismissed: 0,
  });
}

export async function dismissReminder(
  userId: string,
  ethAddress: string,
  current: number
): Promise<boolean> {
  if (!userId || !ethAddress) return false;
  return upsert(userId, {
    eth_address: ethAddress.toLowerCase(),
    reminders_dismissed: Math.max(0, current) + 1,
    last_dismissed_at: new Date().toISOString(),
  });
}

/**
 * The wallet the status row is about — the user_wallets address — and when it
 * was first saved. The profile's address can be a Safe, which is not what the
 * words restore, so the status is always keyed on this one. A missing
 * created_at is null, which keeps the reminder quiet rather than nagging on
 * day one.
 */
export async function getCloudWalletInfo(
  userId: string
): Promise<{ ethAddress: string; createdAt: string | null } | null> {
  if (!userId) return null;
  try {
    const { data, error } = await db()
      .from("user_wallets")
      .select("eth_address, created_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (typeof data?.eth_address !== "string" || !data.eth_address) return null;
    return {
      ethAddress: data.eth_address,
      createdAt: typeof data.created_at === "string" ? data.created_at : null,
    };
  } catch (e) {
    log.warn("walletInfo:failed", e);
    return null;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const REMINDER_MAX_DISMISSALS = 3;
export const REMINDER_WALLET_AGE_DAYS = 2;
export const REMINDER_SNOOZE_DAYS = 3;

function toTime(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/**
 * Show the reminder only to a wallet that is not backed up, at least two days
 * old, dismissed fewer than three times, and not dismissed in the last three
 * days. Unknown status or creation time means no reminder.
 */
export function shouldRemind(
  status: BackupStatus | null,
  walletCreatedAt: string | Date | null,
  now: Date = new Date()
): boolean {
  if (!status || status.backedUpAt) return false;
  if (status.remindersDismissed >= REMINDER_MAX_DISMISSALS) return false;
  const created = toTime(walletCreatedAt);
  if (created === null || now.getTime() - created < REMINDER_WALLET_AGE_DAYS * DAY_MS) return false;
  const lastDismissed = toTime(status.lastDismissedAt);
  if (lastDismissed !== null && now.getTime() - lastDismissed < REMINDER_SNOOZE_DAYS * DAY_MS) return false;
  return true;
}
