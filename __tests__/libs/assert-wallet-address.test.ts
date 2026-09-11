import { assertWalletAddress } from '../../libs/wallet-core/assert-wallet-address';
import { predictSafeAddress } from '../../libs/wallet-core/predict-safe-address';
jest.mock('../../libs/wallet-core/predict-safe-address', () => ({ predictSafeAddress: jest.fn() }));

const owner = '0x1111111111111111111111111111111111111111';
const safe = '0x2222222222222222222222222222222222222222';
const other = '0x3333333333333333333333333333333333333333';

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(predictSafeAddress).mockResolvedValue(safe);
});

it('accepts the owner without an RPC lookup', async () => {
  await expect(assertWalletAddress(owner, owner.toUpperCase().replace('0X', '0x'))).resolves.toBeUndefined();
  expect(predictSafeAddress).not.toHaveBeenCalled();
});
it('accepts only the Safe predicted from this owner', async () => {
  await expect(assertWalletAddress(owner, safe)).resolves.toBeUndefined();
  expect(predictSafeAddress).toHaveBeenCalledWith(owner);
});
it('rejects a different wallet', async () => {
  await expect(assertWalletAddress(owner, other)).rejects.toThrow('different wallet');
});
it('fails closed when prediction is unavailable', async () => {
  jest.mocked(predictSafeAddress).mockResolvedValue(null);
  await expect(assertWalletAddress(owner, safe)).rejects.toThrow('temporarily unavailable');
});
it.each(['', 'not-an-address', '0x123'])('rejects invalid expected address %s', async (expected) => {
  await expect(assertWalletAddress(owner, expected)).rejects.toThrow('could not be verified');
  expect(predictSafeAddress).not.toHaveBeenCalled();
});
it('rejects invalid derived addresses even if equal', async () => {
  await expect(assertWalletAddress('', '')).rejects.toThrow('could not be verified');
});
