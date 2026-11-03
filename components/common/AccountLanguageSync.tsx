/**
 * Tells the account which language this reader uses. Renders nothing.
 *
 * Pushes are written on the server, which has no phone to ask, so it writes
 * them in the account's `preferredLanguage`. This keeps that field on the
 * language the app is showing: once on sign-in when the two differ, and again
 * whenever the reader picks another language. The web app does the same, so
 * the last language chosen on any device is the one pushes arrive in.
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthState, useUser } from '../../context/AuthContext';
import { AuthService } from '../../services/auth.service';

export default function AccountLanguageSync() {
  const { i18n } = useTranslation();
  const { isSignedIn } = useAuthState();
  const user = useUser();
  const address = (user?.walletAddress || user?.address || '').toLowerCase();
  const saved = (user as { preferredLanguage?: string } | null)?.preferredLanguage;
  const language = (i18n.language || 'en').toLowerCase().split('-')[0];
  // What was last sent, per account, so a stale `user` does not resend it.
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !address || !/^[a-z]{2,3}$/.test(language)) return;
    const key = `${address}:${language}`;
    if (saved === language || sent.current === key) return;
    sent.current = key;
    AuthService.updateProfile({ preferredLanguage: language }).catch(() => {
      // Pushes stay in the last saved language; try again on the next change.
      if (sent.current === key) sent.current = null;
    });
  }, [isSignedIn, address, saved, language]);

  return null;
}
