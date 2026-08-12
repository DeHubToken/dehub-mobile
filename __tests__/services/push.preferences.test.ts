import {
  getDefaultNotificationPreferences,
  mergePreferences,
  type NotificationPreferenceKey,
} from '../../services/push/push.service';

// push.service calls setNotificationHandler at module scope, so the mock has to
// carry it or the import throws before any test runs.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  AndroidImportance: { DEFAULT: 3, HIGH: 4, MAX: 5 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('../../libs/api.client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

const ALL_KEYS: NotificationPreferenceKey[] = [
  'likes',
  'comments',
  'commentReplies',
  'mentions',
  'directMessages',
  'newFollowers',
  'tips',
  'subscriptions',
  'ppvPurchases',
  'milestones',
  'livestreamStart',
  'accountAlerts',
  'announcements',
];

describe('services/push.service notification preferences', () => {
  describe('getDefaultNotificationPreferences', () => {
    it('starts every type on, in-app and push alike', () => {
      const prefs = getDefaultNotificationPreferences();
      expect(prefs.inAppEnabled).toBe(true);
      expect(prefs.pushEnabled).toBe(true);
      for (const key of ALL_KEYS) {
        expect(prefs.inApp[key]).toBe(true);
        expect(prefs.push[key]).toBe(true);
      }
    });

    // The defaults are never written at load, and the backend treats a missing
    // key as enabled. A default of `false` therefore describes something the
    // server is not doing, until an unrelated toggle saves the whole object and
    // makes it true. Push and in-app have to agree for that to stay harmless.
    it('agrees with the server rule that an absent key means enabled', () => {
      const prefs = getDefaultNotificationPreferences();
      expect(Object.values(prefs.push).every(Boolean)).toBe(true);
      expect(Object.values(prefs.inApp).every(Boolean)).toBe(true);
    });

    it('leaves quiet hours off so nothing is suppressed by default', () => {
      expect(getDefaultNotificationPreferences().quietHours.enabled).toBe(false);
    });
  });

  describe('mergePreferences', () => {
    it('fills the gaps in a partially saved block instead of replacing it', () => {
      const merged = mergePreferences(getDefaultNotificationPreferences(), {
        inApp: { likes: false } as any,
      });
      expect(merged.inApp.likes).toBe(false);
      expect(merged.inApp.comments).toBe(true);
      expect(merged.inApp.announcements).toBe(true);
      expect(merged.push.likes).toBe(true);
    });

    it('keeps saved values across every block', () => {
      const merged = mergePreferences(getDefaultNotificationPreferences(), {
        pushEnabled: false,
        push: { tips: false } as any,
        quietHours: { enabled: true, start: 1 } as any,
      });
      expect(merged.pushEnabled).toBe(false);
      expect(merged.push.tips).toBe(false);
      expect(merged.push.likes).toBe(true);
      expect(merged.quietHours.enabled).toBe(true);
      expect(merged.quietHours.start).toBe(1);
      expect(merged.quietHours.end).toBe(8);
    });

    it('returns the defaults untouched for an empty or malformed blob', () => {
      const defaults = getDefaultNotificationPreferences();
      expect(mergePreferences(defaults, null)).toEqual(defaults);
      expect(mergePreferences(defaults, undefined)).toEqual(defaults);
      expect(mergePreferences(defaults, {})).toEqual(defaults);
    });

    it('preserves a key written by a newer client', () => {
      const merged = mergePreferences(getDefaultNotificationPreferences(), {
        inApp: { somethingNew: false } as any,
      });
      expect((merged.inApp as any).somethingNew).toBe(false);
      expect(merged.inApp.likes).toBe(true);
    });
  });
});
