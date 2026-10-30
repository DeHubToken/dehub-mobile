import { apiClient } from '../../libs';
import { getLiveStream } from '../../services/live.service';

jest.mock('../../libs', () => ({ apiClient: { get: jest.fn() } }));

describe('live detail requests', () => {
  beforeEach(() => jest.clearAllMocks());
  it('rejects a placeholder without sending a request', async () => {
    await expect(getLiveStream('gallery-live-stream')).rejects.toThrow('Invalid stream id');
    expect(apiClient.get).not.toHaveBeenCalled();
  });
  it('retains real stream identifiers and authenticated request options', async () => {
    const id = '507f1f77bcf86cd799439011';
    (apiClient.get as jest.Mock).mockResolvedValue({ title: 'Live' });
    await expect(getLiveStream(id)).resolves.toEqual({ title: 'Live' });
    expect(apiClient.get).toHaveBeenCalledWith(`/live/${id}`, { isAuthRequired: true });
  });
});
