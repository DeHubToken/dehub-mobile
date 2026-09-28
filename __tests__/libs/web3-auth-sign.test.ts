import { getOrCreateAuthSignature } from '../../libs/web3.auth.sign';
import { utils, Wallet } from 'ethers';
jest.unmock('../../libs/web3.auth.sign');
jest.mock('../../libs/auth.utils', () => ({ getAuthUser: jest.fn().mockResolvedValue(null), setAuthUser: jest.fn() }));
jest.mock('../../libs/provider.registry', () => ({ getSigningProvider: jest.fn() }));

describe('external wallet signing recovery', () => {
  afterEach(() => jest.useRealTimers());
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
  it('reconnects before sending a signature and keeps a failed publish to one request', async () => {
    const events: string[] = [];
    const restartTransport = jest.fn(async () => { events.push('ready'); });
    const request = jest.fn(async () => { events.push('sign'); throw new Error('Failed to publish payload'); });
    await expect(getOrCreateAuthSignature(address, {
      request, signer: { client: { core: { relayer: { connected: true, restartTransport } } } },
    })).rejects.toThrow('Failed to publish payload');
    expect(events).toEqual(['ready', 'sign']);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('encodes personal_sign data while preserving the signed login text', async () => {
    const wallet = Wallet.createRandom();
    let text = '';
    const request = jest.fn(async ({ params }) => {
      expect(params[0]).toMatch(/^0x[0-9a-f]+$/);
      text = utils.toUtf8String(params[0]);
      return wallet.signMessage(utils.arrayify(params[0]));
    });
    const result = await getOrCreateAuthSignature(wallet.address, { request });
    expect(text).toContain(`Your wallet address is ${wallet.address.toLowerCase()}.`);
    expect(utils.verifyMessage(text, result.signature)).toBe(wallet.address);
  });
  it('releases a wallet that never answers and ignores a late signature', async () => {
    jest.useFakeTimers();
    let finish!: (value: string) => void;
    const request = jest.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    const pending = getOrCreateAuthSignature(address, { request });
    const check = expect(pending).rejects.toThrow('Wallet signature timed out');
    await jest.advanceTimersByTimeAsync(120_000);
    await check;
    finish('0xvalidsignature');
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
