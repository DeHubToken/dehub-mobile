import { Buffer } from 'buffer';
import { Passkey } from 'react-native-passkey';
import { supabase } from '../services/supabase';
import { decryptStringWithKeyMaterial } from '../libs/wallet-core/crypto';
import { unlockWithSavedPasskey } from '../libs/wallet-core/passkey-unlock';

jest.mock('react-native-passkey', () => ({ Passkey: { isSupported: jest.fn(() => true), get: jest.fn() } }));
jest.mock('buffer', () => jest.requireActual('buffer/'));
jest.mock('expo-crypto', () => ({ getRandomBytes: () => new Uint8Array(32).fill(3) }));
jest.mock('../services/supabase', () => ({ supabase: { auth: { getSession: jest.fn() }, from: jest.fn() } }));
jest.mock('../libs/wallet-core/crypto', () => ({ decryptStringWithKeyMaterial: jest.fn() }));

const wrap = { credential_id: 'AQI', prf_salt: 'AQIDBA==', encrypted_seed: 'cipher', salt: 'salt', iv: 'iv', kdf_iterations: 0 };
const query = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: 'user' } } } });
  (supabase.from as jest.Mock).mockReturnValue({ select: () => ({ eq: query }) });
  query.mockResolvedValue({ data: [wrap], error: null });
  (Passkey.get as jest.Mock).mockResolvedValue({ id: 'AQI=', clientExtensionResults: { prf: { results: { first: Buffer.alloc(32, 7).toString('base64') } } } });
  (decryptStringWithKeyMaterial as jest.Mock).mockResolvedValue('secret');
});

it('opens the saved web backup with the same salt and securely clears the PRF output', async () => {
  let materialAtDecrypt: number[] = [];
  (decryptStringWithKeyMaterial as jest.Mock).mockImplementation(async (_payload, key) => {
    materialAtDecrypt = Array.from(key);
    return 'secret';
  });
  expect(await unlockWithSavedPasskey('user')).toBe('secret');
  expect(Passkey.get).toHaveBeenCalledWith(expect.objectContaining({ rpId: 'dehub.io', userVerification: 'required',
    extensions: { prf: { eval: { first: new Uint8Array([1, 2, 3, 4]) } } } }));
  expect(materialAtDecrypt).toEqual(Array(32).fill(7));
  expect(Array.from((decryptStringWithKeyMaterial as jest.Mock).mock.calls[0][1])).toEqual(Array(32).fill(0));
});

it('does not query another signed-in identity', async () => {
  await expect(unlockWithSavedPasskey('other')).rejects.toThrow('Sign in again');
  expect(supabase.from).not.toHaveBeenCalled();
});

it('does not mistake a failed backup lookup for no backup', async () => {
  query.mockResolvedValue({ data: null, error: new Error('offline') });
  await expect(unlockWithSavedPasskey('user')).rejects.toThrow('Could not load');
  expect(Passkey.get).not.toHaveBeenCalled();
});

it('rejects a different credential before decryption', async () => {
  (Passkey.get as jest.Mock).mockResolvedValue({ id: 'other', clientExtensionResults: { prf: { results: { first: Buffer.alloc(32).toString('base64') } } } });
  await expect(unlockWithSavedPasskey('user')).rejects.toThrow('could not unlock');
  expect(decryptStringWithKeyMaterial).not.toHaveBeenCalled();
});

it('leaves the wallet untouched when the user cancels', async () => {
  (Passkey.get as jest.Mock).mockRejectedValue(new Error('UserCancelled'));
  await expect(unlockWithSavedPasskey('user')).rejects.toThrow('UserCancelled');
  expect(decryptStringWithKeyMaterial).not.toHaveBeenCalled();
});

it('uses each saved credential salt when several passkeys exist', async () => {
  query.mockResolvedValue({ data: [wrap, { ...wrap, credential_id: 'AwQ', prf_salt: 'BQY=' }], error: null });
  await unlockWithSavedPasskey('user');
  expect(Passkey.get).toHaveBeenCalledWith(expect.objectContaining({ extensions: { prf: { evalByCredential: {
    AQI: { first: new Uint8Array([1, 2, 3, 4]) }, AwQ: { first: new Uint8Array([5, 6]) },
  } } } }));
});

it('requires PRF output rather than treating passkey authentication as wallet access', async () => {
  (Passkey.get as jest.Mock).mockResolvedValue({ id: 'AQI' });
  await expect(unlockWithSavedPasskey('user')).rejects.toThrow('could not unlock');
  expect(decryptStringWithKeyMaterial).not.toHaveBeenCalled();
});
