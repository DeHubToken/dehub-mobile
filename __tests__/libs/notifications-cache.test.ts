jest.mock('../../services/user.service', () => ({ getNotifications: jest.fn() }));
jest.mock('../../libs/custom-notifications', () => ({ fetchCustomNotifications: jest.fn() }));

import { getNotifications } from '../../services/user.service';
import { fetchCustomNotifications } from '../../libs/custom-notifications';
import {
  __resetNotificationsCache,
  mergeFirstPage,
  prefetchNotifications,
  readNotificationSnapshot,
  writeNotificationSnapshot,
} from '../../libs/notifications-cache';

const row = (id: string, createdAt: string) => ({ _id: id, createdAt } as any);

beforeEach(() => {
  __resetNotificationsCache();
  jest.clearAllMocks();
});

it('merges custom rows newest first and leaves the API page alone without them', () => {
  const api = [row('a', '2026-01-03'), row('b', '2026-01-01')];
  expect(mergeFirstPage(api, [])).toBe(api);
  expect(mergeFirstPage(api, [row('c', '2026-01-02')]).map((n) => n._id)).toEqual(['a', 'c', 'b']);
});

it('keeps the list per account, case-insensitively', () => {
  writeNotificationSnapshot('0xABC', [row('a', '2026-01-01')], []);
  expect(readNotificationSnapshot('0xabc')?.notifications[0]._id).toBe('a');
  expect(readNotificationSnapshot('0xdef')).toBeNull();
  expect(readNotificationSnapshot(null)).toBeNull();
});

it('shares one warm-up fetch between callers and stores what it got', async () => {
  (getNotifications as jest.Mock).mockResolvedValue({ result: [row('a', '2026-01-01')] });
  (fetchCustomNotifications as jest.Mock).mockResolvedValue([row('custom_x', '2026-01-02')]);
  const first = prefetchNotifications('0xabc');
  const second = prefetchNotifications('0xabc');
  expect(second).toBe(first);
  await first;
  expect(getNotifications).toHaveBeenCalledTimes(1);
  expect(readNotificationSnapshot('0xabc')?.notifications.map((n) => n._id)).toEqual(['custom_x', 'a']);
  // Fresh snapshot: a second warm-up right after is skipped.
  await prefetchNotifications('0xabc');
  expect(getNotifications).toHaveBeenCalledTimes(1);
});
