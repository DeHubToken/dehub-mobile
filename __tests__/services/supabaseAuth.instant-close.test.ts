import * as WebBrowser from 'expo-web-browser';
import { signInWithGoogle } from '../../services/auth/supabaseAuth.service';
import { supabase } from '../../services/supabase';

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  getCustomTabsSupportingBrowsersAsync: jest.fn(async () => ({
    browserPackages: ['com.mi.globalbrowser', 'com.android.chrome'],
    preferredBrowserPackage: 'com.mi.globalbrowser',
  })),
}));
jest.mock('expo-linking', () => ({ createURL: jest.fn(() => 'dehub://auth-callback') }));
jest.mock('../../services/supabase', () => ({
  supabase: { auth: { signInWithOAuth: jest.fn(), setSession: jest.fn() } },
}));

const open = WebBrowser.openAuthSessionAsync as jest.Mock;
const startOAuth = supabase.auth.signInWithOAuth as jest.Mock;
const setSession = supabase.auth.setSession as jest.Mock;
const SUCCESS = { type: 'success', url: 'dehub://auth-callback#access_token=a&refresh_token=r' };

beforeEach(() => {
  jest.clearAllMocks();
  startOAuth.mockResolvedValue({ data: { url: 'https://supabase/authorize' }, error: null });
  setSession.mockResolvedValue({ data: { user: { id: 'google-user' } }, error: null });
});

// The logs: Google and Apple both "cancelled" in the same second they started,
// attempt after attempt, on the same Android phone.
it('tries again in Chrome when the page closes the instant it opens', async () => {
  open.mockResolvedValueOnce({ type: 'dismiss' }).mockResolvedValueOnce(SUCCESS);
  await expect(signInWithGoogle()).resolves.toBe('google-user');
  expect(open).toHaveBeenCalledTimes(2);
  expect(open.mock.calls[1][2]).toEqual({ createTask: false, browserPackage: 'com.android.chrome' });
});

it('says the page would not open when it closes instantly twice', async () => {
  open.mockResolvedValue({ type: 'dismiss' });
  await expect(signInWithGoogle()).rejects.toThrow('The sign-in page closed before it opened');
});

it('leaves a real cancel alone', async () => {
  open.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve({ type: 'dismiss' }), 1300)));
  await expect(signInWithGoogle()).rejects.toThrow('google sign-in was cancelled');
  expect(open).toHaveBeenCalledTimes(1);
});

it('reads the refusal Supabase sends back', async () => {
  open.mockResolvedValueOnce({ type: 'success', url: 'dehub://auth-callback#error=server_error&error_description=Database+error+saving+new+user' });
  await expect(signInWithGoogle()).rejects.toThrow('Database error saving new user');
});
