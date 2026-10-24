import { translateCopy as _translateCopy } from '../i18n/copy';

/** Keep transport diagnostics out of trading UI without claiming a transaction failed. */
export function dexActionError(error: unknown, fallback = _translateCopy('copy.c520795421e6', { defaultValue: 'Could not complete the DEX action' })): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/over rate limit|rate.?limit|\b429\b|exceeded maximum retry limit/i.test(message)) {
    return _translateCopy('copy.8744ac9fea47', { defaultValue: 'The network provider is busy. Please wait a moment. If you confirmed a transaction, check your wallet activity before retrying.' });
  }
  return message || fallback;
}