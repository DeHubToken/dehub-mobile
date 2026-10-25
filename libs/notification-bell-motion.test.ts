import { notificationBellMotion } from './notification-bell-motion';

describe('notification bell intensity', () => {
  it('stays idle for empty or invalid counts', () => {
    for (const count of [0, -1, NaN, Infinity]) {
      expect(notificationBellMotion(count).intensity).toBe(0);
    }
  });
  it('keeps the selected Soft bloom at 10–30 and softens smaller counts', () => {
    expect(notificationBellMotion(1).intensity).toBeLessThan(notificationBellMotion(9).intensity);
    expect(notificationBellMotion(9).intensity).toBeLessThan(1);
    expect(notificationBellMotion(10).intensity).toBe(1);
    expect(notificationBellMotion(30)).toEqual({ ...notificationBellMotion(10), unread: 30 });
  });
  it('grows smoothly at large counts without excessive swing, reach or brightness', () => {
    const counts = [30, 31, 100, 1000, 10000, 1000000];
    const profiles = counts.map(notificationBellMotion);
    profiles.slice(1).forEach((profile, index) => {
      expect(profile.intensity).toBeGreaterThan(profiles[index].intensity);
      expect(profile.cycleMs).toBeLessThanOrEqual(profiles[index].cycleMs);
      expect(profile.swing).toBeLessThanOrEqual(18.2);
      expect(profile.opacity).toBeLessThanOrEqual(0.72);
      expect(profile.reach).toBeLessThanOrEqual(12);
    });
  });
});
