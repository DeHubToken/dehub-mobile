import env from '../../config/env';

/**
 * Derived, not hardcoded.
 *
 * `__mocks__/@env.ts` looks like it decides this, but it does not:
 * react-native-dotenv inlines `@env` imports at babel time, so jest's
 * moduleNameMapper never gets a say and the mock's SUPABASE_URL never reaches
 * the module under test. Pinning the mock's value here asserted a URL the app
 * cannot produce — and with no `.env` present, as in CI, reading it threw
 * before any test in this file could run.
 */
const ENDPOINT = `${env.SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/client-logs`;

function body(call: any) {
  return JSON.parse(call[1].body);
}

describe('error reporter', () => {
  let reporter: typeof import('../../libs/errorReporter');
  // Re-required after resetModules: the AsyncStorage mock rebuilds its store
  // with the registry, so a handle taken before the reset points at a dead one.
  let storage: typeof import('@react-native-async-storage/async-storage').default;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true });
    storage = require('@react-native-async-storage/async-storage').default;
    reporter = require('../../libs/errorReporter');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('holds rows back until the flush interval, then posts them as one batch', async () => {
    reporter.reportError('Feed', ['something broke']);
    reporter.reportError('Feed', ['something else broke']);
    expect(global.fetch).not.toHaveBeenCalled();

    await reporter.flushLogs();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe('POST');
    expect(body((global.fetch as jest.Mock).mock.calls[0]).logs).toHaveLength(2);
  });

  it('takes the message and stack off an Error and the rest as metadata', async () => {
    const err = new Error('boom');
    reporter.reportError('Feed', [err, { tokenId: 42 }]);
    await reporter.flushLogs();

    const row = body((global.fetch as jest.Mock).mock.calls[0]).logs[0];
    expect(row.level).toBe('error');
    expect(row.component).toBe('Feed');
    expect(row.message).toBe('boom');
    expect(row.stack_trace).toContain('boom');
    expect(JSON.parse(row.metadata.detail)).toEqual({ tokenId: 42 });
    // The context an OOM report is useless without.
    expect(row.metadata.totalMemory).toBeGreaterThan(0);
  });

  it('tags rows with the signed-in account, lowercased', async () => {
    reporter.setLogUserAddress('0xABCDEF');
    reporter.reportError('Auth', ['nope']);
    await reporter.flushLogs();

    expect(body((global.fetch as jest.Mock).mock.calls[0]).logs[0].user_address).toBe('0xabcdef');
  });

  it('keeps a batch the network refused, and sends it on the next launch', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    reporter.reportError('Feed', ['offline when it happened']);
    await reporter.flushLogs();

    expect(await storage.getItem('error_reporter_pending_v1')).toContain(
      'offline when it happened',
    );

    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    await reporter.drainPersistedLogs();

    const sent = body((global.fetch as jest.Mock).mock.calls[1]).logs[0];
    expect(sent.message).toBe('offline when it happened');
    // Cleared, so a permanent failure doesn't replay the same rows forever.
    expect(await storage.getItem('error_reporter_pending_v1')).toBeNull();
  });

  it('drops rows with nothing to say rather than posting empty ones', async () => {
    reporter.reportError('Feed', []);
    reporter.reportError('Feed', [{ onlyAnObject: true }]);
    await reporter.flushLogs();

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('never lets a send failure escape', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));
    reporter.reportError('Feed', ['first']);
    await expect(reporter.flushLogs()).resolves.toBeUndefined();
  });
});
