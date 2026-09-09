import * as SecureStore from 'expo-secure-store';
import { requireDeviceOwner } from '../../libs/biometric-gate';
import {
  forgetDeviceVerification,
  getPrivateKeyForAddress,
  rememberSuccessfulWalletUnlock,
  setPrivateKeyForAddress,
} from '../../libs/wallets.local';

jest.mock('../../libs/biometric-gate', () => ({
  requireDeviceOwner: jest.fn().mockResolvedValue('verified'),
}));

const verify = requireDeviceOwner as jest.MockedFunction<typeof requireDeviceOwner>;
const ADDRESS = '0x1111111111111111111111111111111111111111';
const KEY = `0x${'22'.repeat(32)}`;

describe('wallet key verification grace', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    forgetDeviceVerification();
    (SecureStore as any).__clear?.();
    await setPrivateKeyForAddress(ADDRESS, KEY);
  });

  it('does not ask for a second credential immediately after wallet unlock', async () => {
    rememberSuccessfulWalletUnlock();

    await expect(
      getPrivateKeyForAddress(ADDRESS, { purpose: 'Set up encrypted messages' }),
    ).resolves.toBe(KEY);
    expect(verify).not.toHaveBeenCalled();
  });

  it('asks again after the in-memory unlock proof is cleared', async () => {
    rememberSuccessfulWalletUnlock();
    forgetDeviceVerification();

    await getPrivateKeyForAddress(ADDRESS, { purpose: 'Sign a reply' });
    expect(verify).toHaveBeenCalledTimes(1);
  });
});
