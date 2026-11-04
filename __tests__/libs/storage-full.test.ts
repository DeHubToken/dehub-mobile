import AsyncStorage from '@react-native-async-storage/async-storage';
import { resilientAsyncStorage, isStorageFullError } from '../../libs/storage-full';

const full = new Error('database or disk is full (code 13 SQLITE_FULL)');

beforeEach(async () => { await AsyncStorage.clear(); jest.restoreAllMocks(); });

it('recognises the Android full-store error', () => {
  expect(isStorageFullError(full)).toBe(true);
  expect(isStorageFullError(new Error('Invalid code'))).toBe(false);
});

it('frees disposable caches and retries when the store is full', async () => {
  await AsyncStorage.setItem('locale-pack:old:tr:core', 'x');
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(full);
  await resilientAsyncStorage.setItem('sb-x-auth-token', 'session');
  expect(await AsyncStorage.getItem('locale-pack:old:tr:core')).toBeNull();
  expect(await resilientAsyncStorage.getItem('sb-x-auth-token')).toBe('session');
});

it('keeps the session when the store stays full', async () => {
  await AsyncStorage.setItem('sb-x-auth-token', 'old');
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValue(full);
  await resilientAsyncStorage.setItem('sb-x-auth-token', 'new');
  expect(await resilientAsyncStorage.getItem('sb-x-auth-token')).toBe('new');
  await resilientAsyncStorage.removeItem('sb-x-auth-token');
  expect(await resilientAsyncStorage.getItem('sb-x-auth-token')).toBeNull();
});
