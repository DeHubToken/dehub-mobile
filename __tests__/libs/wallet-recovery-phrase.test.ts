import { ethers } from 'ethers';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireDeviceOwner } from '../../libs/biometric-gate';
import { getRecoveryPhraseForAddress, upsertLocalAccount, removeLocalAccount, rememberSuccessfulWalletUnlock } from '../../libs/wallets.local';

jest.mock('../../libs/logger', () => ({ createLogger: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));
jest.mock('../../libs/biometric-gate', () => ({ requireDeviceOwner: jest.fn().mockResolvedValue('verified') }));

const words12 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const words24 = `${'abandon '.repeat(23)}art`;
const owner = jest.mocked(requireDeviceOwner);

beforeEach(async () => {
  jest.clearAllMocks();
  (SecureStore as any).__clear();
  await AsyncStorage.clear();
  owner.mockResolvedValue('verified');
});

it.each([words12, words24])('retains an imported phrase in device-only protected storage', async (phrase) => {
  const wallet = ethers.Wallet.fromMnemonic(phrase, "m/44'/60'/0'/0/0");
  await upsertLocalAccount({ address: wallet.address, privateKey: wallet.privateKey, recoveryPhrase: phrase.toUpperCase() });
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    `local_wallet_phrase_${wallet.address.toLowerCase()}`, phrase,
    expect.objectContaining({ keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  );
  const publicStorage = await AsyncStorage.getItem('@local_wallet_accounts_v1');
  expect(publicStorage).not.toContain(phrase);
  expect(publicStorage).not.toContain(wallet.privateKey);
  rememberSuccessfulWalletUnlock();
  await expect(getRecoveryPhraseForAddress(wallet.address, { purpose: 'Show recovery phrase' })).resolves.toBe(phrase);
  expect(owner).toHaveBeenCalledWith('Show recovery phrase');
});

it('preserves a saved phrase when the signing key is refreshed without it', async () => {
  const wallet = ethers.Wallet.fromMnemonic(words12);
  await upsertLocalAccount({ address: wallet.address, privateKey: wallet.privateKey, recoveryPhrase: words12 });
  await upsertLocalAccount({ address: wallet.address, privateKey: wallet.privateKey });
  await expect(getRecoveryPhraseForAddress(wallet.address, { purpose: 'Show recovery phrase' })).resolves.toBe(words12);
});

it('never releases a phrase after device verification is rejected', async () => {
  const wallet = ethers.Wallet.fromMnemonic(words12);
  await upsertLocalAccount({ address: wallet.address, privateKey: wallet.privateKey, recoveryPhrase: words12 });
  owner.mockRejectedValueOnce(new Error('Verification rejected'));
  await expect(getRecoveryPhraseForAddress(wallet.address, { purpose: 'Show recovery phrase' })).rejects.toThrow('Verification rejected');
});

it('rejects a phrase for another address before saving the account', async () => {
  await expect(upsertLocalAccount({ address: '0x1111111111111111111111111111111111111111', recoveryPhrase: words12 })).rejects.toThrow('does not match');
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});

it('removes the protected phrase when the local wallet is removed', async () => {
  const wallet = ethers.Wallet.fromMnemonic(words12);
  await upsertLocalAccount({ address: wallet.address, privateKey: wallet.privateKey, recoveryPhrase: words12 });
  await removeLocalAccount(wallet.address);
  await expect(getRecoveryPhraseForAddress(wallet.address, { purpose: 'Show recovery phrase' })).resolves.toBeNull();
  expect(owner).not.toHaveBeenCalled();
});
