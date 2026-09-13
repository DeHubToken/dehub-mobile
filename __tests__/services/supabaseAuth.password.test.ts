import { signInWithEmailPassword } from '../../services/auth/supabaseAuth.service';
import { supabase } from '../../services/supabase';

// Imported at module scope by the service for its OAuth helpers, which these
// tests never touch — stubbed so the password path can be exercised alone.
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ createURL: jest.fn(() => 'dehub://auth-callback') }));

jest.mock('../../services/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    auth: { signInWithPassword: jest.fn() },
  },
}));

const mockSignIn = supabase.auth.signInWithPassword as jest.Mock;

describe('services/auth/supabaseAuth.service email + password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('trims the email and returns the Supabase user id', async () => {
    mockSignIn.mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null });

    await expect(signInWithEmailPassword('  demo@dehub.io ', 'hunter2')).resolves.toBe('user-1');

    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'demo@dehub.io',
      password: 'hunter2',
    });
  });

  // The password itself is never trimmed — leading or trailing spaces are part
  // of it, and silently eating them would reject a valid credential.
  it('passes the password through untouched', async () => {
    mockSignIn.mockResolvedValueOnce({ data: { user: { id: 'user-2' } }, error: null });

    await signInWithEmailPassword('demo@dehub.io', '  spaced  ');

    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'demo@dehub.io',
      password: '  spaced  ',
    });
  });

  it('surfaces the Supabase error message', async () => {
    mockSignIn.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid login credentials' },
    });

    await expect(signInWithEmailPassword('demo@dehub.io', 'wrong')).rejects.toThrow(
      'Invalid login credentials',
    );
  });

  it('fails rather than returning an empty identity', async () => {
    mockSignIn.mockResolvedValueOnce({ data: { user: null }, error: null });

    await expect(signInWithEmailPassword('demo@dehub.io', 'hunter2')).rejects.toThrow(
      'Sign-in failed. Please try again.',
    );
  });
});
