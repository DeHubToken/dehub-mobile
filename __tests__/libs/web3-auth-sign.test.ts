import { getOrCreateAuthSignature } from '../../libs/web3.auth.sign';
jest.unmock('../../libs/web3.auth.sign');
jest.mock('../../libs/auth.utils', () => ({ getAuthUser: jest.fn().mockResolvedValue(null), setAuthUser: jest.fn() }));
jest.mock('../../libs/provider.registry', () => ({ getSigningProvider: jest.fn() }));

describe('external wallet signing recovery', () => {
  const address = '0x1111111111111111111111111111111111111111';
  it('does not ask again after cancellation or a broken connection', async () => {
    for (const error of [{ code: 4001, message: 'User rejected' }, new TypeError('Network request failed')]) {
      const request = jest.fn().mockRejectedValue(error);
      await expect(getOrCreateAuthSignature(address, { request })).rejects.toThrow(error.message);
      expect(request).toHaveBeenCalledTimes(1);
    }
  });
  it('uses reversed parameters only when the provider refuses their order', async () => {
    const request = jest.fn().mockRejectedValueOnce({ code: -32602, message: 'Invalid params' }).mockResolvedValueOnce('0xvalidsignature');
    await expect(getOrCreateAuthSignature(address, { request })).resolves.toMatchObject({ signature: '0xvalidsignature' });
    expect(request.mock.calls[1][0].params[0]).toBe(address);
  });
});
