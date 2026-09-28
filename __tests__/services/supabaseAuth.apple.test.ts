import { signInWithApple } from '../../services/auth/supabaseAuth.service';
import { supabase } from '../../services/supabase';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ createURL: jest.fn() }));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'raw-nonce'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async () => 'hashed-nonce'),
}));
jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  signInAsync: jest.fn(),
}));
jest.mock('../../services/supabase', () => ({
  supabase: { auth: { signInWithIdToken: jest.fn(), updateUser: jest.fn() } },
}));

const nativeSignIn = AppleAuthentication.signInAsync as jest.Mock;
const exchange = supabase.auth.signInWithIdToken as jest.Mock;
const update = supabase.auth.updateUser as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  nativeSignIn.mockResolvedValue({ identityToken: 'apple-token', fullName: null });
  exchange.mockResolvedValue({ data: { session: { user: { id: 'apple-user' } } }, error: null });
  update.mockResolvedValue({ error: null });
});

it('opens native Apple sign-in and exchanges the identity token with the raw nonce', async () => {
  await expect(signInWithApple()).resolves.toBe('apple-user');
  expect(Crypto.digestStringAsync).toHaveBeenCalledWith('SHA-256', 'raw-nonce');
  expect(nativeSignIn).toHaveBeenCalledWith({ requestedScopes: [0, 1], nonce: 'hashed-nonce' });
  expect(exchange).toHaveBeenCalledWith({ provider: 'apple', token: 'apple-token', nonce: 'raw-nonce' });
});

it('retains the name Apple supplies on first authorization', async () => {
  nativeSignIn.mockResolvedValue({ identityToken: 'apple-token', fullName: { givenName: 'Sam', familyName: 'Lee' } });
  await signInWithApple();
  expect(update).toHaveBeenCalledWith({ data: { full_name: 'Sam Lee' } });
});

it('keeps a returning user name when Apple does not supply it again', async () => {
  await signInWithApple();
  expect(update).not.toHaveBeenCalled();
});

it('does not continue provisioning after cancellation', async () => {
  nativeSignIn.mockRejectedValue(new Error('cancelled'));
  await expect(signInWithApple()).rejects.toThrow('cancelled');
  expect(exchange).not.toHaveBeenCalled();
});

it('refuses a missing identity token', async () => {
  nativeSignIn.mockResolvedValue({ identityToken: null });
  await expect(signInWithApple()).rejects.toThrow('identity token');
  expect(exchange).not.toHaveBeenCalled();
});

it('surfaces an exchange failure instead of returning a signed-in identity', async () => {
  exchange.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid audience' } });
  await expect(signInWithApple()).rejects.toThrow('Invalid audience');
});
