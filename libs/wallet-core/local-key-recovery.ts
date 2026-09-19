import { getPrivateKeyForAddress, hasPrivateKeyForAddress, listLocalAccounts, upsertLocalAccount } from '../wallets.local';
import { predictSafeAddress } from './predict-safe-address';
import { assertWalletAddress } from './assert-wallet-address';
import { deriveFromSecret } from './derive';
import { createLogger } from '../logger';

const log = createLogger('wallet-key-recovery');

/** The private key belongs to the EOA; an account address may be its Safe. */
export async function verifyWalletKeyForAccount(
  privateKey: string,
  expectedWalletAddress: string,
  sessionAccountAddress?: string | null,
) {
  const owner = deriveFromSecret(privateKey);
  await assertWalletAddress(owner.ethAddress, expectedWalletAddress);
  if (sessionAccountAddress) await assertWalletAddress(owner.ethAddress, sessionAccountAddress);
  return owner;
}

/** Presence only: old installs may have filed the owner key under its Safe. */
export async function findLocalWalletKeyAddress(expected: string): Promise<string | null> {
  const address = expected.toLowerCase();
  if (await hasPrivateKeyForAddress(address)) return address;
  const safe = await predictSafeAddress(address);
  if (safe && await hasPrivateKeyForAddress(safe)) return safe;
  // The inverse case: the cloud row names a Safe, while the key is filed by EOA.
  for (const account of await listLocalAccounts()) {
    if (await predictSafeAddress(account.address) === address && await hasPrivateKeyForAddress(account.address)) {
      return account.address;
    }
  }
  return null;
}

/** A matching address is only a candidate. Verify ownership before repairing. */
export async function recoverLocalWalletKey(expected: string, purpose: string): Promise<string | null> {
  const storedAddress = await findLocalWalletKeyAddress(expected);
  if (!storedAddress) return null;
  const privateKey = await getPrivateKeyForAddress(storedAddress, { purpose });
  if (!privateKey) return null;
  await verifyWalletKeyForAccount(privateKey, expected);
  if (storedAddress.toLowerCase() !== expected.toLowerCase()) {
    await upsertLocalAccount({ address: expected, privateKey });
    log.error('recovered-key-from-wallet-alias', { source: 'verified-local-key' });
  }
  return privateKey;
}
