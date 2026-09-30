import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseUserId } from '../services/auth/supabaseAuth.service';
import {
  dismissReminder,
  getBackupStatus,
  getCloudWalletInfo,
  shouldRemind,
  type BackupStatus,
} from '../libs/wallet-core/backup-status';

/**
 * Backup state for the signed-in user's cloud wallet, for the Settings row and
 * the reminder banner. `status` stays null whenever anything is unknown (no
 * Supabase identity, no wallet row, a failed read) so the UI shows nothing
 * rather than a wrong "not backed up".
 */
export function useWalletBackupStatus(enabled: boolean) {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const ctx = useRef<{ userId: string; ethAddress: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      ctx.current = null;
      setStatus(null);
      return;
    }
    const userId = await getSupabaseUserId();
    const wallet = userId ? await getCloudWalletInfo(userId) : null;
    if (!userId || !wallet) {
      ctx.current = null;
      setStatus(null);
      return;
    }
    ctx.current = { userId, ethAddress: wallet.ethAddress };
    setCreatedAt(wallet.createdAt);
    setStatus(await getBackupStatus(userId, wallet.ethAddress));
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** "Not now": hide the banner at once; the count is written in the background. */
  const dismiss = useCallback(() => {
    const current = status;
    const c = ctx.current;
    if (!current || !c) return;
    setStatus({
      ...current,
      remindersDismissed: current.remindersDismissed + 1,
      lastDismissedAt: new Date().toISOString(),
    });
    void dismissReminder(c.userId, c.ethAddress, current.remindersDismissed);
  }, [status]);

  /** The backup modal recorded a backup; reflect it without another read. */
  const markLocal = useCallback((backedUpAt: string) => {
    setStatus((s) => (s ? { ...s, backedUpAt, remindersDismissed: 0 } : s));
  }, []);

  return {
    status,
    remind: shouldRemind(status, createdAt),
    dismiss,
    markLocal,
    refresh,
  };
}
