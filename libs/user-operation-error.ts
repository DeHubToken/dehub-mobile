import { translateCopy as _translateCopy } from '../i18n/copy';

/** What userOperationValidationMessage can return, so parseTxError can read a translated one back as English. */
export const USER_OPERATION_MESSAGES = [
  { key: 'copy.5f6ee7408686', en: 'The wallet transaction nonce changed. Please retry.' },
  { key: 'copy.aa6a25801331', en: 'The network gas quote changed. Please retry for a fresh quote.' },
] as const;

/** Keep the provider's reason without copying credentials or signed request bodies. */
export function userOperationErrorDetail(error: unknown): string {
  const seen = new Set<unknown>();
  let current: any = error;
  let detail = typeof error === 'string' ? error : 'Unknown user operation error';
  for (let i = 0; current && typeof current === 'object' && i < 8 && !seen.has(current); i++) {
    seen.add(current);
    const text = current.details || current.reason || current.shortMessage || current.message;
    if (typeof text === 'string') detail = text;
    current = current.cause || current.error;
  }
  return detail.split(/\n(?:Request|Raw Call|Contract Call|User Operation|URL:|Body:)/i)[0]
    .replace(/https?:\/\/\S+/gi, '[RPC URL]')
    .replace(/(?:apikey|api_key|authorization|token)\s*[:=]\s*[^\s,;]+/gi, '[credential]')
    .replace(/0x[\da-f]{65,}/gi, '[hex data]')
    .slice(0, 1000);
}

export function userOperationValidationMessage(detail: string): string | undefined {
  if (/\baa25\b|invalid account nonce/i.test(detail)) {
    return _translateCopy('copy.5f6ee7408686', { defaultValue: 'The wallet transaction nonce changed. Please retry.' });
  }
  if (/(?:maxFeePerGas|maxPriorityFeePerGas|gas price)[^\n]*(?:too low|must be|less than|below)|(?:too low|below)[^\n]*(?:maxFeePerGas|maxPriorityFeePerGas|gas price)/i.test(detail)) {
    return _translateCopy('copy.aa6a25801331', { defaultValue: 'The network gas quote changed. Please retry for a fresh quote.' });
  }
}
