import { pollHasEnded, pollVotePercent, pollOptionWins } from '../../libs/pollResults';

describe('poll rules shared with public post cards', () => {
  const now = Date.parse('2026-10-10T00:00:00Z');
  it('closes expired polls despite a stale active flag', () => {
    expect(pollHasEnded({ isActive: true, expiresAt: '2026-10-09T19:30:05.887Z' }, now)).toBe(true);
    expect(pollHasEnded({ isActive: true, expiresAt: '2099-01-01' }, now)).toBe(false);
    expect(pollHasEnded({ isActive: false, expiresAt: '2099-01-01' }, now)).toBe(true);
    expect(pollHasEnded({ isActive: true, isExpired: true }, now)).toBe(true);
  });
  it('matches final percentages, ties and the no-votes case', () => {
    expect(pollVotePercent(55, 123)).toBe(45);
    expect(pollVotePercent(68, 123)).toBe(55);
    expect(pollVotePercent(0, 0)).toBe(0);
    expect(pollOptionWins(5, 5, true)).toBe(true);
    expect(pollOptionWins(0, 0, true)).toBe(false);
    expect(pollOptionWins(5, 5, false)).toBe(false);
  });
});
