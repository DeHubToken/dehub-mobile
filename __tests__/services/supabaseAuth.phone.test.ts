import { sendPhoneOtp, verifyPhoneOtp } from '../../services/auth/supabaseAuth.service';
import { supabase } from '../../services/supabase';

// Imported at module scope by the service for its OAuth helpers, which these
// tests never touch — stubbed so the phone path can be exercised in isolation.
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ createURL: jest.fn(() => 'dehub://auth-callback') }));

jest.mock('../../services/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    auth: { setSession: jest.fn() },
  },
}));

const mockInvoke = supabase.functions.invoke as jest.Mock;
const mockSetSession = supabase.auth.setSession as jest.Mock;

const SESSION = { access_token: 'access-abc', refresh_token: 'refresh-xyz' };

describe('services/auth/supabaseAuth.service phone OTP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendPhoneOtp', () => {
    it('calls the request-phone-otp edge function with a trimmed number', async () => {
      mockInvoke.mockResolvedValueOnce({ data: { success: true }, error: null });

      await sendPhoneOtp('  +14155552671  ');

      expect(mockInvoke).toHaveBeenCalledWith('request-phone-otp', {
        body: { phone: '+14155552671' },
      });
    });

    // The reason this function exists: the native provider is off, so the code
    // must come from the edge function and nothing else. The supabase mock has
    // no signInWithOtp, so a revert to the native path fails here rather than
    // silently at runtime.
    it('sends exactly one edge function call and no native auth call', async () => {
      mockInvoke.mockResolvedValueOnce({ data: { success: true }, error: null });

      await sendPhoneOtp('+14155552671');

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockSetSession).not.toHaveBeenCalled();
    });

    it('surfaces a transport error', async () => {
      mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('network down') });

      await expect(sendPhoneOtp('+14155552671')).rejects.toThrow('network down');
    });

    // The edge functions answer 200 with { error } rather than a non-2xx, so a
    // failure looks like success to invoke() unless the body is checked.
    it('throws on a 200 response carrying an error body', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { error: 'Too many codes requested for this number. Please try again later.' },
        error: null,
      });

      await expect(sendPhoneOtp('+14155552671')).rejects.toThrow(
        'Too many codes requested for this number. Please try again later.',
      );
    });
  });

  describe('verifyPhoneOtp', () => {
    it('sends the phone and code, installs the session and returns the user id', async () => {
      mockInvoke.mockResolvedValueOnce({ data: { session: SESSION }, error: null });
      mockSetSession.mockResolvedValueOnce({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      });

      const userId = await verifyPhoneOtp(' +14155552671 ', ' 123456 ');

      expect(mockInvoke).toHaveBeenCalledWith('verify-phone-otp', {
        body: { phone: '+14155552671', code: '123456' },
      });
      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: 'access-abc',
        refresh_token: 'refresh-xyz',
      });
      expect(userId).toBe('user-123');
    });

    it('throws the edge function message for a wrong code', async () => {
      mockInvoke.mockResolvedValueOnce({ data: { error: 'Incorrect code.' }, error: null });

      await expect(verifyPhoneOtp('+14155552671', '000000')).rejects.toThrow('Incorrect code.');
      expect(mockSetSession).not.toHaveBeenCalled();
    });

    it('throws when the response carries no session tokens', async () => {
      mockInvoke.mockResolvedValueOnce({ data: { session: { access_token: 'only-one' } }, error: null });

      await expect(verifyPhoneOtp('+14155552671', '123456')).rejects.toThrow(
        'Sign-in failed. Please try again.',
      );
      expect(mockSetSession).not.toHaveBeenCalled();
    });

    it('throws when the session cannot be installed', async () => {
      mockInvoke.mockResolvedValueOnce({ data: { session: SESSION }, error: null });
      mockSetSession.mockResolvedValueOnce({ data: { session: null }, error: new Error('bad token') });

      await expect(verifyPhoneOtp('+14155552671', '123456')).rejects.toThrow('bad token');
    });
  });
});
