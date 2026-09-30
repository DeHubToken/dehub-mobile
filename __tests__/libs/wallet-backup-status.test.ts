const mockMaybeSingle = jest.fn();
const mockUpsert = jest.fn();
const mockFrom = jest.fn(() => ({
  select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
  upsert: mockUpsert,
}));
jest.mock('../../services/supabase', () => ({ supabase: { from: (...args: unknown[]) => (mockFrom as any)(...args) } }));
jest.mock('../../libs/logger', () => ({ createLogger: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));

import {
  dismissReminder,
  getBackupStatus,
  markBackedUp,
  parseBackupStatusRow,
  shouldRemind,
  type BackupStatus,
} from '../../libs/wallet-core/backup-status';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-30T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY).toISOString();
const address = '0xAbCdEf0000000000000000000000000000000001';
const fresh: BackupStatus = { backedUpAt: null, remindersDismissed: 0, lastDismissedAt: null };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('shouldRemind', () => {
  it('reminds a two-day-old wallet that was never backed up or dismissed', () => {
    expect(shouldRemind(fresh, daysAgo(2), now)).toBe(true);
  });

  it('waits until the wallet is two days old', () => {
    expect(shouldRemind(fresh, daysAgo(1.9), now)).toBe(false);
  });

  it('never reminds a backed-up wallet', () => {
    expect(shouldRemind({ ...fresh, backedUpAt: daysAgo(1) }, daysAgo(10), now)).toBe(false);
  });

  it('stops after three dismissals', () => {
    expect(shouldRemind({ ...fresh, remindersDismissed: 2, lastDismissedAt: daysAgo(4) }, daysAgo(30), now)).toBe(true);
    expect(shouldRemind({ ...fresh, remindersDismissed: 3, lastDismissedAt: daysAgo(40) }, daysAgo(60), now)).toBe(false);
  });

  it('stays quiet for three days after a dismissal', () => {
    expect(shouldRemind({ ...fresh, remindersDismissed: 1, lastDismissedAt: daysAgo(2.9) }, daysAgo(30), now)).toBe(false);
    expect(shouldRemind({ ...fresh, remindersDismissed: 1, lastDismissedAt: daysAgo(3) }, daysAgo(30), now)).toBe(true);
  });

  it('says nothing when the status or creation time is unknown', () => {
    expect(shouldRemind(null, daysAgo(30), now)).toBe(false);
    expect(shouldRemind(fresh, null, now)).toBe(false);
    expect(shouldRemind(fresh, 'not a date', now)).toBe(false);
  });
});

describe('parseBackupStatusRow', () => {
  it('reads a row for the same wallet regardless of case', () => {
    expect(
      parseBackupStatusRow(
        { eth_address: address.toLowerCase(), backed_up_at: daysAgo(1), reminders_dismissed: 2, last_dismissed_at: daysAgo(5) },
        address
      )
    ).toEqual({ backedUpAt: daysAgo(1), remindersDismissed: 2, lastDismissedAt: daysAgo(5) });
  });

  it('treats a row for another wallet as not backed up', () => {
    expect(
      parseBackupStatusRow({ eth_address: '0x1111111111111111111111111111111111111111', backed_up_at: daysAgo(1), reminders_dismissed: 3 }, address)
    ).toEqual(fresh);
  });

  it('treats no row as not backed up', () => {
    expect(parseBackupStatusRow(null, address)).toEqual(fresh);
  });
});

describe('Supabase access', () => {
  it('returns null instead of throwing when the read fails', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: new Error('relation does not exist') });
    await expect(getBackupStatus('user-1', address)).resolves.toBeNull();
    mockMaybeSingle.mockRejectedValueOnce(new Error('offline'));
    await expect(getBackupStatus('user-1', address)).resolves.toBeNull();
  });

  it('marks the wallet backed up and resets dismissals', async () => {
    mockUpsert.mockResolvedValueOnce({ error: null });
    await expect(markBackedUp('user-1', address)).resolves.toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('wallet_backup_status');
    const [row, options] = mockUpsert.mock.calls[0];
    expect(row).toMatchObject({ user_id: 'user-1', eth_address: address.toLowerCase(), reminders_dismissed: 0 });
    expect(typeof row.backed_up_at).toBe('string');
    expect(options).toEqual({ onConflict: 'user_id' });
  });

  it('counts a dismissal and swallows write failures', async () => {
    mockUpsert.mockResolvedValueOnce({ error: null });
    await expect(dismissReminder('user-1', address, 1)).resolves.toBe(true);
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({ reminders_dismissed: 2 });
    mockUpsert.mockRejectedValueOnce(new Error('offline'));
    await expect(dismissReminder('user-1', address, 2)).resolves.toBe(false);
  });
});
