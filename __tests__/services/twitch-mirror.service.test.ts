import { apiClient } from '../../libs/api.client';
import { twitchMirror } from '../../services/twitch-mirror.service';

jest.mock('../../libs/api.client', () => ({ apiClient: { fetch: jest.fn() } }));

describe('mobile Twitch mirroring API', () => {
  beforeEach(() => jest.clearAllMocks());
  it('uses the mobile callback without accepting an arbitrary redirect URL', async () => {
    (apiClient.fetch as jest.Mock).mockResolvedValue({ result: { url: 'https://id.twitch.tv/oauth2/authorize?state=test' } });
    expect(await twitchMirror.connect()).toMatch(/^https:\/\/id.twitch.tv\//);
    expect(apiClient.fetch).toHaveBeenCalledWith('/live/twitch/connect', { method: 'POST', body: { mobile: true } });
  });
  it('can turn automatic mirroring off and accepts an enveloped status', async () => {
    (apiClient.fetch as jest.Mock).mockResolvedValue({ result: { connected: true, enabled: false } });
    expect(await twitchMirror.enable(false)).toEqual({ connected: true, enabled: false });
    expect(apiClient.fetch).toHaveBeenCalledWith('/live/twitch', { method: 'PATCH', body: { enabled: false } });
  });
  it('disconnects through the authenticated core API without a second api prefix', async () => {
    (apiClient.fetch as jest.Mock).mockResolvedValue({ connected: false });
    expect(await twitchMirror.disconnect()).toEqual({ connected: false });
    expect(apiClient.fetch).toHaveBeenCalledWith('/live/twitch', { method: 'DELETE' });
  });
});
