import { ethers } from 'ethers';
import { loadBackupSource, phraseForBackup } from '../../libs/wallet-core/backup';
import { fetchWalletReliably } from '../../libs/wallet-core/store';
import { hasBiometricWrapKey } from '../../libs/wallet-core/biometric-unlock';

jest.mock('../../libs/wallet-core/store', () => ({ fetchWalletReliably: jest.fn() }));
jest.mock('../../libs/wallet-core/biometric-unlock', () => ({ hasBiometricWrapKey: jest.fn() }));
jest.mock('../../libs/wallet-core/crypto', () => ({ getPayloadKdf: (p: { ciphertext: string }) => p.ciphertext === 'biometric' ? 'hkdf' : 'argon2id' }));

const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const key = ethers.Wallet.fromMnemonic(phrase, "m/44'/60'/0'/0/0").privateKey;
const address = new ethers.Wallet(key).address;
const payload = { ciphertext: 'password', salt: '', iv: '', iterations: 0 };
const fetchWallet = jest.mocked(fetchWalletReliably);
const hasWrap = jest.mocked(hasBiometricWrapKey);

beforeEach(() => {
  jest.clearAllMocks();
  fetchWallet.mockResolvedValue({ wallet: { ethAddress: address, payload }, failed: false });
  hasWrap.mockResolvedValue(true);
});

it('offers the encrypted phrase password for this wallet', async () => {
  await expect(loadBackupSource('user', key)).resolves.toMatchObject({ kind: 'password', wallet: { ethAddress: address } });
});

it('does not turn a failed cloud lookup into a wallet with no phrase', async () => {
  fetchWallet.mockResolvedValue({ wallet: null, failed: true });
  await expect(loadBackupSource('user', key)).rejects.toThrow('lookup failed');
});

it('explains that a missing identity cannot determine the phrase', async () => {
  await expect(loadBackupSource(null, key)).resolves.toEqual({ kind: 'none', reason: 'unavailable' });
  expect(fetchWallet).not.toHaveBeenCalled();
});

it('does not offer another wallet\'s encrypted phrase', async () => {
  fetchWallet.mockResolvedValue({ wallet: { ethAddress: 'another-wallet', payload }, failed: false });
  await expect(loadBackupSource('user', key)).resolves.toEqual({ kind: 'none', reason: 'unavailable' });
});

it('routes a web passkey wallet back to its original device', async () => {
  fetchWallet.mockResolvedValue({ wallet: { ethAddress: address, payload: null }, failed: false });
  await expect(loadBackupSource('user', key)).resolves.toEqual({ kind: 'none', reason: 'other-device' });
});

it('offers biometrics only on a phone that has the wrapping key', async () => {
  fetchWallet.mockResolvedValue({ wallet: { ethAddress: address, payload: { ...payload, ciphertext: 'biometric' } }, failed: false });
  await expect(loadBackupSource('user', key)).resolves.toMatchObject({ kind: 'biometric' });
  hasWrap.mockResolvedValue(false);
  await expect(loadBackupSource('user', key)).resolves.toEqual({ kind: 'none', reason: 'other-device' });
});

it('preserves the real phrase and accepts a key without its 0x prefix', () => {
  expect(phraseForBackup(phrase.toUpperCase().replaceAll(' ', '\n'), key.slice(2))).toBe(phrase);
});

it('identifies a verified raw-key backup without inventing words', () => {
  expect(phraseForBackup(key, key.slice(2))).toBeNull();
});

it('rejects a decrypted phrase or raw key for a different wallet', () => {
  const anotherKey = `0x${'01'.repeat(32)}`;
  expect(() => phraseForBackup(phrase, anotherKey)).toThrow('does not match');
  expect(() => phraseForBackup(anotherKey, key)).toThrow('does not match');
});
