import * as SecureStore from 'expo-secure-store';
import { hasPrivateKeyForAddress, setPrivateKeyForAddress, upsertLocalAccount, listLocalAccounts } from '../../libs/wallets.local';
import { readWalletStorage, writeWalletStorage, WalletStorageError } from '../../libs/wallet-core/secure-storage';
import { enrollBiometricUnlock, hasBiometricWrapKey } from '../../libs/wallet-core/biometric-unlock';

jest.mock('../../libs/logger', () => ({ createLogger: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));
jest.mock('../../libs/biometric-gate', () => ({ requireDeviceOwner: jest.fn().mockResolvedValue('verified') }));
jest.mock('expo-crypto', () => ({ getRandomBytes: jest.fn(() => new Uint8Array(32).fill(7)) }));
jest.mock('../../libs/wallet-core/crypto', () => ({ encryptStringWithKeyMaterial: jest.fn().mockResolvedValue({ ciphertext: 'encrypted' }) }));

const address = '0x1111111111111111111111111111111111111111';
const key = `0x${'22'.repeat(32)}`;
const get = SecureStore.getItemAsync as jest.Mock;
const set = SecureStore.setItemAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as any).__clear();
});

it('distinguishes an absent key from an unreadable keystore', async () => {
  await expect(readWalletStorage('missing')).resolves.toBeNull();
  get.mockRejectedValueOnce(new Error('native failure'));
  await expect(hasPrivateKeyForAddress(address)).rejects.toBeInstanceOf(WalletStorageError);
  get.mockRejectedValueOnce(new Error('native failure'));
  await expect(hasBiometricWrapKey(address)).rejects.toBeInstanceOf(WalletStorageError);
});

it('rejects a silent write failure and a mismatched read-back', async () => {
  set.mockResolvedValueOnce(undefined);
  await expect(writeWalletStorage('silent', key)).rejects.toBeInstanceOf(WalletStorageError);
  get.mockResolvedValueOnce('stale-value');
  await expect(setPrivateKeyForAddress(address, key)).rejects.toBeInstanceOf(WalletStorageError);
});

it('does not publish a local account when its private key failed to persist', async () => {
  set.mockRejectedValueOnce(new Error('disk full'));
  await expect(upsertLocalAccount({ address, privateKey: key })).rejects.toBeInstanceOf(WalletStorageError);
  expect(await listLocalAccounts()).not.toEqual(expect.arrayContaining([expect.objectContaining({ address })]));
});

it('does not produce a cloud backup when its biometric key failed verification', async () => {
  set.mockResolvedValueOnce(undefined);
  await expect(enrollBiometricUnlock(address, 'secret')).rejects.toBeInstanceOf(WalletStorageError);
  const { encryptStringWithKeyMaterial } = require('../../libs/wallet-core/crypto');
  expect(encryptStringWithKeyMaterial).not.toHaveBeenCalled();
});

it('keeps the existing biometric wrapping key across an enrollment retry', async () => {
  const wrappingKey = 'ab'.repeat(32);
  await SecureStore.setItemAsync(`wallet_biometric_wrapkey_${address}`, wrappingKey);
  await enrollBiometricUnlock(address, 'secret');
  expect(await SecureStore.getItemAsync(`wallet_biometric_wrapkey_${address}`)).toBe(wrappingKey);
});
