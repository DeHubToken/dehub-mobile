jest.mock('../../libs/token-refresh', () => ({ tokenRefreshManager: { ensureFreshToken: jest.fn().mockResolvedValue(undefined) } }));
jest.mock('../../libs/auth.utils', () => ({ getAuthToken: jest.fn().mockResolvedValue('verified-session') }));
import { pollAiTool, pollVideoGeneration, runModel3d } from '../../services/ai.service';
afterEach(() => jest.restoreAllMocks());
for (const provider of ['replicate', 'fal', 'kie', 'kie-veo', 'venice']) {
  it(`sends account authentication on ${provider} status polls without a new generation`, async () => {
    const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'processing' }) } as Response);
    await pollVideoGeneration('owned-ticket', { provider, falAppId: 'owned-model', walletAddress: '0xABCD' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ 'x-dehub-token': 'verified-session', 'x-wallet-address': '0xabcd' });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ predictionId: 'owned-ticket', provider });
  });
}
it('authenticates a resumed private tool poll', async () => {
  const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'processing' }) } as Response);
  await pollAiTool({ requestId: 'owned-tool', appId: 'owned-model' }, '0xABCD');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ 'x-dehub-token': 'verified-session', 'x-wallet-address': '0xabcd' });
});
it('authenticates a resumed private 3D poll', async () => {
  const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'processing', predictionId: 'owned-3d' }) } as Response);
  await runModel3d({ predictionId: 'owned-3d', falAppId: 'owned-model' }, '0xABCD');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ 'x-dehub-token': 'verified-session', 'x-wallet-address': '0xabcd' });
});
