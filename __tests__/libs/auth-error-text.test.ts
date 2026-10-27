import i18n from 'i18next';
import { isSignInCancelled, serverAuthText } from '../../libs/auth-error-text';

afterEach(() => { (i18n as any).language = undefined; (i18n as any).resolvedLanguage = undefined; });

it('shows the server text to English readers and the translation to everyone else', () => {
  expect(serverAuthText('Token has expired or is invalid', 'Kod geçersiz')).toBe('Token has expired or is invalid');
  (i18n as any).language = 'tr';
  expect(serverAuthText('Token has expired or is invalid', 'Kod geçersiz')).toBe('Kod geçersiz');
  (i18n as any).language = 'en-GB';
  expect(serverAuthText('Invalid login credentials', 'x')).toBe('Invalid login credentials');
  expect(serverAuthText('', 'fallback')).toBe('fallback');
  expect(serverAuthText(undefined, 'fallback')).toBe('fallback');
});

it('treats closing a sign-in sheet as a choice, not a failure', () => {
  expect(isSignInCancelled(new Error('google sign-in was cancelled'))).toBe(true);
  expect(isSignInCancelled(Object.assign(new Error('The user canceled the authorization attempt'), { code: 'ERR_REQUEST_CANCELED' }))).toBe(true);
  expect(isSignInCancelled({ code: 'ERR_CANCELED' })).toBe(true);
  expect(isSignInCancelled(new Error('Invalid login credentials'))).toBe(false);
  expect(isSignInCancelled(null)).toBe(false);
});
