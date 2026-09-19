import * as SecureStore from 'expo-secure-store';
import { createLogger } from '../logger';

const log = createLogger('wallet-storage');

export class WalletStorageError extends Error {
  constructor() {
    super('Your phone could not read or save the wallet securely. Try again without reinstalling the app or clearing its data.');
    this.name = 'WalletStorageError';
  }
}

/** Never report an unreadable store as a missing wallet, or log its contents. */
export async function readWalletStorage(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    log.error('read-failed', { errorName: error instanceof Error ? error.name : 'unknown' });
    throw new WalletStorageError();
  }
}

/** Setup may continue only after the exact value has survived a round trip. */
export async function writeWalletStorage(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    if (await SecureStore.getItemAsync(key) !== value) throw new WalletStorageError();
  } catch (error) {
    log.error('write-verification-failed', { errorName: error instanceof Error ? error.name : 'unknown' });
    throw new WalletStorageError();
  }
}
