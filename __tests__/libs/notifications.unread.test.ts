import {
  countUnreadNotifications,
  extractNotificationItems,
  incrementUnreadCount,
} from '../../libs/notifications.unread';

describe('notification unread count', () => {
  it('reads the API data envelope and excludes read rows', () => {
    const response = {
      data: {
        result: [{ read: false }, { read: true }, {}],
      },
    };

    expect(extractNotificationItems(response)).toHaveLength(3);
    expect(countUnreadNotifications(response)).toBe(2);
  });

  it('supports the direct result envelope used by older API responses', () => {
    expect(countUnreadNotifications({ result: [{ read: false }, { read: false }] })).toBe(2);
  });

  it('returns zero for malformed responses', () => {
    expect(countUnreadNotifications(null)).toBe(0);
    expect(countUnreadNotifications({ data: { result: 'not-an-array' } })).toBe(0);
  });

  it('increments safely for foreground push delivery', () => {
    expect(incrementUnreadCount(undefined)).toBe(1);
    expect(incrementUnreadCount(4)).toBe(5);
    expect(incrementUnreadCount(-2)).toBe(1);
  });
});
