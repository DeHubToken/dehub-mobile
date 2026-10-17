import { parseLocal, windowPrompt, windowRange } from '../../libs/agent-task-window';

describe('every post in a time period', () => {
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
