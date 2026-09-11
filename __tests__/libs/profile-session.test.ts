import { profileSessionMatchesWallet } from '../../libs/profile-session';
import { predictSafeAddress } from '../../libs/wallet-core/predict-safe-address';
jest.mock('../../libs/wallet-core/predict-safe-address', () => ({ predictSafeAddress: jest.fn() }));
const owner = '0x0e240d0eaa38f6c210afab2925cda30e0b86882b';
const safe = '0xd627ad6a37e91985b9413a721a000feed9d9125f';
beforeEach(() => jest.resetAllMocks());
it('accepts the existing smart-wallet profile with locked keys', async () => {
  (predictSafeAddress as jest.Mock).mockResolvedValue(safe);
  expect(await profileSessionMatchesWallet(safe, owner)).toBe(true);
});
it('rejects a different account without opening a wallet', async () => {
  (predictSafeAddress as jest.Mock).mockResolvedValue(safe);
  expect(await profileSessionMatchesWallet('0x1111111111111111111111111111111111111111', owner)).toBe(false);
});
it('accepts explicit email links without comparing an unrelated wallet', async () => {
  expect(await profileSessionMatchesWallet(safe, owner, 'wallet-email')).toBe(true);
  expect(predictSafeAddress).not.toHaveBeenCalled();
});
it('accepts owner profiles and existing links with no stored wallet', async () => {
  expect(await profileSessionMatchesWallet(owner, owner)).toBe(true);
  expect(await profileSessionMatchesWallet(safe)).toBe(true);
});
