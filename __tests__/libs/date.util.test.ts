import {
  secondsToHMMSS, msToHHMMSS, formatJoinedDate,
  formatRelativeFromNow, formatChatTimeSmart,
} from '../../libs/date.util';

describe('libs/date.util', () => {
  describe('secondsToHMMSS', () => {
    it('returns undefined for undefined/null/NaN', () => {
      expect(secondsToHMMSS(undefined)).toBeUndefined();
      expect(secondsToHMMSS(null as any)).toBeUndefined();
      expect(secondsToHMMSS(NaN)).toBeUndefined();
    });

    it('formats seconds under an hour as MM:SS', () => {
      expect(secondsToHMMSS(0)).toBe('00:00');
      expect(secondsToHMMSS(65)).toBe('01:05');
      expect(secondsToHMMSS(3599)).toBe('59:59');
    });

    it('formats seconds over an hour as HH:MM:SS', () => {
      expect(secondsToHMMSS(3600)).toBe('01:00:00');
      expect(secondsToHMMSS(3661)).toBe('01:01:01');
      expect(secondsToHMMSS(7384)).toBe('02:03:04');
    });

    it('treats negative values as 0', () => {
      expect(secondsToHMMSS(-100)).toBe('00:00');
    });
  });

  describe('msToHHMMSS', () => {
    it('returns undefined for undefined/null', () => {
      expect(msToHHMMSS(undefined)).toBeUndefined();
      expect(msToHHMMSS(null as any)).toBeUndefined();
    });

    it('converts milliseconds to HH:MM:SS', () => {
      expect(msToHHMMSS(0)).toBe('00:00:00');
      expect(msToHHMMSS(61000)).toBe('00:01:01');
      expect(msToHHMMSS(3661000)).toBe('01:01:01');
    });
  });

  describe('formatJoinedDate', () => {
    it('returns null for falsy input', () => {
      expect(formatJoinedDate(null)).toBeNull();
      expect(formatJoinedDate(undefined)).toBeNull();
      expect(formatJoinedDate('')).toBeNull();
    });

    it('returns null for invalid date', () => {
      expect(formatJoinedDate('not-a-date')).toBeNull();
    });

    it('formats a valid ISO date', () => {
      const result = formatJoinedDate('2024-03-15T10:00:00Z');
      expect(result).toBeTruthy();
      expect(result).toContain('2024');
      expect(result).toContain('15');
    });
  });

  describe('formatRelativeFromNow', () => {
    it('returns "now" for falsy input', () => {
      expect(formatRelativeFromNow(null)).toBe('now');
      expect(formatRelativeFromNow(undefined)).toBe('now');
    });

    it('returns "now" for invalid date', () => {
      expect(formatRelativeFromNow('bogus')).toBe('now');
    });

    it('returns "now" for very recent time', () => {
      expect(formatRelativeFromNow(new Date())).toBe('now');
    });

    it('returns minutes ago', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatRelativeFromNow(fiveMinAgo)).toBe('5 mins ago');
    });

    it('returns singular "1 min ago"', () => {
      const oneMinAgo = new Date(Date.now() - 1.5 * 60 * 1000);
      expect(formatRelativeFromNow(oneMinAgo)).toBe('1 min ago');
    });

    it('returns hours ago', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      expect(formatRelativeFromNow(threeHoursAgo)).toBe('3 hours ago');
    });

    it('returns days ago', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      expect(formatRelativeFromNow(twoDaysAgo)).toBe('2 days ago');
    });

    it('returns weeks ago', () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      expect(formatRelativeFromNow(twoWeeksAgo)).toBe('2 weeks ago');
    });

    it('returns months ago', () => {
      const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      expect(formatRelativeFromNow(threeMonthsAgo)).toBe('3 months ago');
    });

    it('returns years ago', () => {
      const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
      expect(formatRelativeFromNow(twoYearsAgo)).toBe('2 years ago');
    });
  });

  describe('formatChatTimeSmart', () => {
    it('returns "now" for falsy', () => {
      expect(formatChatTimeSmart(null)).toBe('now');
    });

    it('returns relative time within threshold', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const result = formatChatTimeSmart(twoHoursAgo, 6);
      expect(result).toBe('2 hours ago');
    });

    it('returns absolute time beyond threshold', () => {
      const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000);
      const result = formatChatTimeSmart(tenHoursAgo, 6);
      expect(result).toMatch(/\d+:\d+\s*(AM|PM)/);
    });
  });
});
