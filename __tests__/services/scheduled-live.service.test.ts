import { getUserScheduledLives } from '../../services/live.service';
import { apiClient } from '../../libs';

jest.mock('../../libs', () => ({ apiClient: { get: jest.fn() } }));

describe('scheduled livestream discovery', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([false, true])('accepts raw and enveloped responses (envelope=%s)', async envelope => {
    const rows = [{ _id: 'room-1', title: 'Next show', status: 'SCHEDULED', scheduledFor: '2026-10-14T16:00:00.000Z' }];
    (apiClient.get as jest.Mock).mockResolvedValue(envelope ? { result: rows } : rows);
    expect(await getUserScheduledLives('0xabc')).toEqual([{ streamId: 'room-1', name: 'Next show', scheduleAt: Date.parse(rows[0].scheduledFor), thumbnailUrl: null }]);
  });

  it('retains overdue broadcasts and excludes streams that have already aired', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue([
      { _id: 'late', title: 'Still waiting', status: 'SCHEDULED', scheduledFor: '2020-01-01T12:00:00Z' },
      { _id: 'ended', title: 'Finished', status: 'ENDED', scheduledFor: '2020-01-01T12:00:00Z' },
    ]);
    expect((await getUserScheduledLives('0xabc')).map(item => item.streamId)).toEqual(['late']);
    expect(apiClient.get).toHaveBeenCalledWith('/live/user/0xabc/scheduled?futureOnly=false', { isAuthRequired: true });
  });
});
