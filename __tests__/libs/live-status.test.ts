import { hasStreamEnded, isStreamLive, streamRefreshInterval } from '../../libs/live-status';

describe('stream lifecycle', () => {
  it('does not let stale live flags or retained publish keys revive an ended broadcast', () => {
    expect(isStreamLive({ status: 'ENDED', isActive: true, streamKey: 'retained' }, true)).toBe(false);
    expect(isStreamLive({ status: 'LIVE', settings: { status: 'ended' } }, true)).toBe(false);
    expect(isStreamLive({ status: 'SCHEDULED', streamKey: 'retained' }, true)).toBe(false);
    expect(isStreamLive({ streamKey: 'retained' })).toBe(false);
  });

  it('keeps paused streams available and supports case-insensitive backend status', () => {
    expect(isStreamLive({ status: 'paused' })).toBe(true);
    expect(isStreamLive({ status: 'active' })).toBe(true);
    expect(hasStreamEnded({ status: 'inactive' })).toBe(true);
    expect(isStreamLive(undefined)).toBe(false);
  });

  it('refreshes live playback and a recent capture, then stops once the replay resolves', () => {
    const now = Date.parse('2026-09-18T01:00:00Z');
    const ended = { status: 'ENDED', endedAt: new Date(now - 60_000).toISOString() };
    expect(streamRefreshInterval({ status: 'LIVE' }, now)).toBe(30_000);
    expect(streamRefreshInterval(ended, now)).toBe(10_000);
    for (const status of ['ready', 'failed', 'skipped']) {
      expect(streamRefreshInterval({ ...ended, recording: { status } }, now)).toBe(false);
    }
    expect(streamRefreshInterval(ended, now + 10 * 60_000)).toBe(false);
    expect(streamRefreshInterval({ status: 'ENDED' }, now)).toBe(false);
  });
});
