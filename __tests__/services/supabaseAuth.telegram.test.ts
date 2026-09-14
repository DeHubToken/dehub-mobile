import * as WebBrowser from 'expo-web-browser';
import { isTelegramLoginAvailable, signInWithTelegram } from '../../services/auth/supabaseAuth.service';
import { supabase } from '../../services/supabase';

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
const mockOpenAuth = WebBrowser.openAuthSessionAsync as jest.Mock;

const SESSION = { access_token: 'access-abc', refresh_token: 'refresh-xyz' };
const PAYLOAD = 'eyJpZCI6MTIzfQ';

/** The GET half of telegram-auth: the public bot config. */
const configOk = () => ({ data: { enabled: true, botId: '7788990011' }, error: null });

describe('services/auth/supabaseAuth.service telegram', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isTelegramLoginAvailable', () => {
    it('is false when no bot is configured, so the row never renders', async () => {
      mockInvoke.mockResolvedValueOnce({ data: { enabled: false, botId: null }, error: null });
      await expect(isTelegramLoginAvailable()).resolves.toBe(false);
    });

    it('is false when the config call fails outright', async () => {
      mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('network down') });
      await expect(isTelegramLoginAvailable()).resolves.toBe(false);
    });

    it('is true once the function reports a bot', async () => {
      mockInvoke.mockResolvedValueOnce(configOk());
      await expect(isTelegramLoginAvailable()).resolves.toBe(true);
    });
  });

  describe('signInWithTelegram', () => {
    it('refuses before opening a browser when no bot is configured', async () => {
      mockInvoke.mockResolvedValueOnce({ data: { enabled: false, botId: null }, error: null });

      await expect(signInWithTelegram()).rejects.toThrow('Telegram login is not available');
      expect(mockOpenAuth).not.toHaveBeenCalled();
    });

    /**
     * Telegram only redirects to the domain registered against the bot, so the
     * return address has to be the dehub.io bridge page and not the app scheme.
     * Getting this wrong fails at Telegram with "Bot domain invalid", which is
     * why it is asserted rather than left to a device.
     */
    it('sends Telegram to the web bridge and waits on the app scheme', async () => {
      mockInvoke.mockResolvedValueOnce(configOk());
      mockOpenAuth.mockResolvedValueOnce({ type: 'dismiss' });

      await expect(signInWithTelegram()).rejects.toThrow('cancelled');

      const [url, redirect] = mockOpenAuth.mock.calls[0];
      expect(url).toContain('https://oauth.telegram.org/auth');
      expect(url).toContain('bot_id=7788990011');
      expect(url).toContain(`origin=${encodeURIComponent('https://dehub.io')}`);
      expect(url).toContain(`return_to=${encodeURIComponent('https://dehub.io/auth/telegram?app=1')}`);
      expect(redirect).toBe('dehub://auth-callback');
    });

    it('exchanges the payload, installs the session and returns the user id', async () => {
      mockInvoke
        .mockResolvedValueOnce(configOk())
        .mockResolvedValueOnce({ data: { session: SESSION }, error: null });
      mockOpenAuth.mockResolvedValueOnce({
        type: 'success',
        url: `dehub://auth-callback#tgAuthResult=${PAYLOAD}`,
      });
      mockSetSession.mockResolvedValueOnce({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      });

      await expect(signInWithTelegram()).resolves.toBe('user-123');

      expect(mockInvoke).toHaveBeenLastCalledWith('telegram-auth', {
        body: { tgAuthResult: PAYLOAD },
      });
      expect(mockSetSession).toHaveBeenCalledWith(SESSION);
    });

    // Telegram can hand the browser back to the redirect with nothing attached
    // — that is the person closing the consent screen, and the callers key off
    // "cancelled" to stay silent about it.
    it('treats a return with no payload as a cancel', async () => {
      mockInvoke.mockResolvedValueOnce(configOk());
      mockOpenAuth.mockResolvedValueOnce({ type: 'success', url: 'dehub://auth-callback' });

      await expect(signInWithTelegram()).rejects.toThrow('cancelled');
      expect(mockSetSession).not.toHaveBeenCalled();
    });

    // The edge function answers 200 with { error } rather than a non-2xx, so a
    // rejected signature looks like success to invoke() unless the body is read.
    it('throws on a 200 response carrying an error body', async () => {
      mockInvoke
        .mockResolvedValueOnce(configOk())
        .mockResolvedValueOnce({
          data: { error: 'Could not verify your Telegram login. Please try again.' },
          error: null,
        });
      mockOpenAuth.mockResolvedValueOnce({
        type: 'success',
        url: `dehub://auth-callback#tgAuthResult=${PAYLOAD}`,
      });

      await expect(signInWithTelegram()).rejects.toThrow('Could not verify your Telegram login');
      expect(mockSetSession).not.toHaveBeenCalled();
    });
  });
});
