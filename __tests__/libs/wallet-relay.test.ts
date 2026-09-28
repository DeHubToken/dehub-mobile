import { prepareWalletRelay, isWalletRelayPublishError } from '../../libs/wallet-relay';

describe('wallet relay readiness', () => {
  afterEach(() => jest.useRealTimers());

  it('waits for a fresh socket before allowing the wallet handoff', async () => {
    let finish!: () => void;
    const relay = { connected: true, restartTransport: jest.fn(() => new Promise<void>(r => { finish = r; })) };
    let ready = false;
    const pending = prepareWalletRelay({ signer: { client: { core: { relayer: relay } } } }).then(() => { ready = true; });
    await Promise.resolve();
    expect(ready).toBe(false);
    expect(relay.restartTransport).toHaveBeenCalledTimes(1);
    finish();
    await pending;
    expect(ready).toBe(true);
  });

  it('waits for an existing connection when restart has not finished it', async () => {
    const relay = { connected: false, restartTransport: jest.fn().mockResolvedValue(undefined), transportOpen: jest.fn(async () => { relay.connected = true; }) };
    await prepareWalletRelay({ client: { core: { relayer: relay } } });
    expect(relay.transportOpen).toHaveBeenCalledTimes(1);
  });

  it('leaves injected and local providers alone', async () => {
    const request = jest.fn();
    await prepareWalletRelay({ request });
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects an unavailable relay without sending or repeating a signature', async () => {
    const request = jest.fn();
    const relay = { connected: false, restartTransport: jest.fn().mockRejectedValue(new Error('Offline')) };
    await expect(prepareWalletRelay({ request, signer: { client: { core: { relayer: relay } } } })).rejects.toThrow('Offline');
    expect(request).not.toHaveBeenCalled();
  });

  it('bounds a stuck reconnect so login can be tried again', async () => {
    jest.useFakeTimers();
    const pending = prepareWalletRelay({ client: { core: { relayer: { restartTransport: () => new Promise(() => {}) } } } });
    const check = expect(pending).rejects.toThrow('Wallet connection timed out');
    await jest.advanceTimersByTimeAsync(15_000);
    await check;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('recognizes wrapped publish errors without treating rejection as a reconnect', () => {
    expect(isWalletRelayPublishError({ cause: new Error('Failed to publish payload, please try again. id:1 tag:1108') })).toBe(true);
    expect(isWalletRelayPublishError({ code: 4001, message: 'Failed to publish payload' })).toBe(false);
    expect(isWalletRelayPublishError(new TypeError('Network request failed'))).toBe(false);
  });
});
