import * as SecureStore from 'expo-secure-store';
import { ethers } from 'ethers';
import { requireDeviceOwner } from '../../libs/biometric-gate';
import { upsertLocalAccount, forgetDeviceVerification } from '../../libs/wallets.local';
import { findLocalWalletKeyAddress, recoverLocalWalletKey } from '../../libs/wallet-core/local-key-recovery';
import { predictSafeAddress } from '../../libs/wallet-core/predict-safe-address';

jest.mock('../../libs/biometric-gate', () => ({ requireDeviceOwner: jest.fn().mockResolvedValue('verified') }));
jest.mock('../../libs/wallet-core/predict-safe-address', () => ({ predictSafeAddress: jest.fn() }));
jest.mock('../../libs/logger', () => ({ createLogger: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));

const key = `0x${'22'.repeat(32)}`;
const owner = new ethers.Wallet(key).address.toLowerCase();
const safe = '0x1111111111111111111111111111111111111111';

beforeEach(() => {
  jest.clearAllMocks();
  forgetDeviceVerification();
  (SecureStore as any).__clear();
  (predictSafeAddress as jest.Mock).mockImplementation(async (address: string) => address.toLowerCase() === owner ? safe : null);
});

it('finds a key filed under the Safe without asking for biometrics during presence checks', async () => {
  await upsertLocalAccount({ address: safe, privateKey: key });
  await expect(findLocalWalletKeyAddress(owner)).resolves.toBe(safe);
  expect(requireDeviceOwner).not.toHaveBeenCalled();
  await expect(recoverLocalWalletKey(owner, 'Unlock')).resolves.toBe(key);
  expect(requireDeviceOwner).toHaveBeenCalled();
  expect(await SecureStore.getItemAsync(`local_wallet_pk_${owner}`)).toBe(key);
});

it('finds an owner entry when the requested address is its Safe', async () => {
  await upsertLocalAccount({ address: owner, privateKey: key });
  await expect(recoverLocalWalletKey(safe, 'Unlock')).resolves.toBe(key);
  expect(await SecureStore.getItemAsync(`local_wallet_pk_${safe}`)).toBe(key);
});

it('does not adopt an unrelated key even if its entry is labelled with the expected Safe', async () => {
  await upsertLocalAccount({ address: safe, privateKey: `0x${'33'.repeat(32)}` });
  await expect(recoverLocalWalletKey(owner, 'Unlock')).rejects.toThrow();
  expect(await SecureStore.getItemAsync(`local_wallet_pk_${owner}`)).toBeNull();
});

it('never repairs a key when device-owner verification is rejected', async () => {
  await upsertLocalAccount({ address: safe, privateKey: key });
  (requireDeviceOwner as jest.Mock).mockRejectedValueOnce(new Error('cancelled'));
  await expect(recoverLocalWalletKey(owner, 'Unlock')).rejects.toThrow('cancelled');
  expect(await SecureStore.getItemAsync(`local_wallet_pk_${owner}`)).toBeNull();
});
