jest.mock('../../libs/logger', () => {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return { createLogger: () => logger, __logger: logger };
});
jest.mock('../../libs/dm-e2ee/keys', () => ({
  hasIdentityFor: jest.fn(),
  loadIdentity: jest.fn(),
  setupIdentity: jest.fn(),
  syncPublishedKey: jest.fn(),
}));

import { ensureDmEncryption, retryDmEncryption } from '../../libs/dm-e2ee/setup';
import * as keys from '../../libs/dm-e2ee/keys';

const mockLog = (jest.requireMock('../../libs/logger') as any).__logger as {
  debug: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};
const mockKeys = keys as jest.Mocked<typeof keys>;

const ADDRESS = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('DM encryption setup status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKeys.hasIdentityFor.mockReturnValue(false);
    mockKeys.loadIdentity.mockResolvedValue(false);
    mockKeys.syncPublishedKey.mockResolvedValue(undefined);
  });

  it('reports an actionable client error when setup genuinely fails', async () => {
    mockKeys.setupIdentity.mockRejectedValue(new Error('key publish failed'));

    await expect(ensureDmEncryption(ADDRESS)).resolves.toBe('error');
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'key publish failed' }),
      expect.objectContaining({ event: 'ensure:failed', address: '0xaaaa...aaaa' }),
    );
  });

  it('treats a declined unlock as cancellation without error reporting', async () => {
    const refusal = new Error('cancelled');
    refusal.name = 'BiometricRejectedError';
    mockKeys.setupIdentity.mockRejectedValue(refusal);

    await expect(ensureDmEncryption(ADDRESS)).resolves.toBe('locked');
    expect(mockLog.error).not.toHaveBeenCalled();

    mockKeys.setupIdentity.mockResolvedValue({ publicKey: '0xpublished' });
    await expect(retryDmEncryption(ADDRESS)).resolves.toBe('ready');
  });
});
