import { parseLocal, toggleWindowAction, windowPrompt, windowRange } from '../../libs/agent-task-window';

describe('every post in a time period', () => {
  it('preserves filters and supports hour, month and all-time scopes', () => {
    const now = new Date('2026-10-17T12:00:00Z');
    expect(windowRange('last1h', { from: '', to: '' }, now)?.from.toISOString()).toBe('2026-10-17T11:00:00.000Z');
    expect(windowRange('last30d', { from: '', to: '' }, now)?.from.toISOString()).toBe('2026-09-17T12:00:00.000Z');
    expect(windowRange('allTime', { from: '', to: '' }, now)?.from.getTime()).toBe(0);
    expect(toggleWindowAction(['view', 'like'], 'dislike')).toEqual(['view', 'dislike']);
    expect(windowPrompt({ from: new Date(0), to: now }, ['dislike'], '', { author: '@maldoteth', category: 'Music' })).toContain('Actions: dislike\nAuthor: @maldoteth\nCategory: Music');
  });
  const now = new Date(2026, 9, 17, 12, 0);

  it('reads typed local dates and rejects impossible ones', () => {
    expect(parseLocal('2026-10-17 18:30').getTime()).toBe(new Date(2026, 9, 17, 18, 30).getTime());
    expect(parseLocal('2026-10-17').getHours()).toBe(0);
    expect(Number.isNaN(parseLocal('2026-02-30').getTime())).toBe(true);
    expect(Number.isNaN(parseLocal('tomorrow').getTime())).toBe(true);
  });

  it('builds windows from presets and custom dates, capped at 31 days ahead', () => {
    expect(windowRange('last7d', { from: '', to: '' }, now)?.from.getTime()).toBe(now.getTime() - 7 * 86400000);
    expect(windowRange('custom', { from: '2026-10-10', to: '2026-10-11 09:00' }, now)).not.toBeNull();
    expect(windowRange('custom', { from: '2026-10-11', to: '2026-10-10' }, now)).toBeNull();
    expect(windowRange('custom', { from: '2026-10-10', to: '2026-12-31' }, now)).toBeNull();
  });

  it('writes the exact instruction the task runner parses', () => {
    const range = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-02T00:00:00Z') };
    expect(windowPrompt(range, ['like', 'view', 'reply'], 'friendly')).toBe(
      'Every post from 2026-10-01T00:00:00.000Z to 2026-10-02T00:00:00.000Z\nActions: view, like, reply\nReply style: friendly');
  });
});
