import { ethers } from 'ethers';
import { importSecretKind, privateKeyFromImportSecret } from '../../libs/wallet-core/derive';

// The BIP-39 test vector phrases (all-zero entropy).
const words12 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const words24 =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon ' +
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
const key = `0x${'11'.repeat(32)}`;

it('recognises a private key with or without 0x', () => {
  expect(importSecretKind(key)).toBe('key');
  expect(importSecretKind(key.slice(2))).toBe('key');
  expect(privateKeyFromImportSecret(key.slice(2))).toBe(key);
});

it('recognises 12 and 24 words, however they were pasted', () => {
  expect(importSecretKind(words12)).toBe('phrase');
  expect(importSecretKind(`  ${words12.replace(/ /g, '\n')}  `)).toBe('phrase');
  expect(importSecretKind(words12.toUpperCase())).toBe('phrase');
  expect(importSecretKind(words24)).toBe('phrase');
});

it('derives the same key a DeHub-created wallet would', () => {
  const expected = ethers.Wallet.fromMnemonic(words12, "m/44'/60'/0'/0/0").privateKey;
  expect(privateKeyFromImportSecret(words12)).toBe(expected);
});

it('rejects anything else', () => {
  expect(importSecretKind('')).toBeNull();
  expect(importSecretKind('0x1234')).toBeNull();
  expect(importSecretKind(words12.replace(/about$/, 'abandon'))).toBeNull();
  // Valid BIP-39 but not a length DeHub offers.
  expect(importSecretKind('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon')).toBeNull();
  expect(() => privateKeyFromImportSecret('not a secret')).toThrow();
});
