import { deriveFromSecret, isRawPrivateKey } from './derive';
import { fetchWalletReliably, type StoredWallet } from './store';
import { getPayloadKdf, type EncryptedPayload } from './crypto';
import { hasBiometricWrapKey } from './biometric-unlock';

export type BackupSource =
  | { kind: 'none'; reason: 'unavailable' | 'other-device' }
  | { kind: 'password' | 'biometric'; wallet: StoredWallet & { payload: EncryptedPayload } };

export class BackupMismatchError extends Error {
  constructor() { super('Wallet backup does not match the active wallet'); }
}

/** A failed lookup says nothing about whether this wallet has a phrase. */
export async function loadBackupSource(userId: string | null, privateKey: string): Promise<BackupSource> {
  if (!userId) return { kind: 'none', reason: 'unavailable' };
  const { wallet, failed } = await fetchWalletReliably(userId);
  if (failed) throw new Error('Wallet backup lookup failed');
  if (!wallet || wallet.ethAddress.toLowerCase() !== deriveFromSecret(privateKey).ethAddress.toLowerCase()) {
    return { kind: 'none', reason: 'unavailable' };
  }
  const payload = wallet.payload;
  if (!payload) return { kind: 'none', reason: 'other-device' };
  if (getPayloadKdf(payload) === 'hkdf') {
    if (!(await hasBiometricWrapKey(wallet.ethAddress))) return { kind: 'none', reason: 'other-device' };
    return { kind: 'biometric', wallet: { ...wallet, payload } };
  }
  return { kind: 'password', wallet: { ...wallet, payload } };
}

/** Null means a verified raw-key backup, never a failed or mismatched phrase. */
export function phraseForBackup(secret: string, privateKey: string): string | null {
  const derived = deriveFromSecret(secret);
  const active = deriveFromSecret(privateKey);
  if (derived.ethPrivateKey.toLowerCase() !== active.ethPrivateKey.toLowerCase()) {
    throw new BackupMismatchError();
  }
  return isRawPrivateKey(derived.secret) ? null : derived.secret;
}
