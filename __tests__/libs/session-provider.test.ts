import { selectSessionProvider } from '../../libs/wallet-core/session-provider';

const owner = '0x1111111111111111111111111111111111111111';
const safe = '0x2222222222222222222222222222222222222222';
const ownerProvider = { request: jest.fn().mockResolvedValue([owner]) };

it('uses the matching Smart Wallet provider for a Smart Wallet session', async () => {
  const smartProvider = { request: jest.fn().mockResolvedValue([safe]) };
  await expect(selectSessionProvider(safe, owner, ownerProvider, smartProvider)).resolves.toBe(smartProvider);
});

it('does not silently upgrade an EOA session into a Smart Wallet', async () => {
  const smartProvider = { request: jest.fn().mockResolvedValue([safe]) };
  await expect(selectSessionProvider(owner, owner, ownerProvider, smartProvider)).resolves.toBe(ownerProvider);
});

it('does not downgrade a Smart Wallet to its owner when the Smart Wallet provider is unavailable', async () => {
  await expect(selectSessionProvider(safe, owner, ownerProvider, null)).rejects.toThrow('Nothing was sent');
});

it('rejects a provider for a different Smart Wallet', async () => {
  const smartProvider = { request: jest.fn().mockResolvedValue(['0x3333333333333333333333333333333333333333']) };
  await expect(selectSessionProvider(safe, owner, ownerProvider, smartProvider)).rejects.toThrow('Nothing was sent');
});
