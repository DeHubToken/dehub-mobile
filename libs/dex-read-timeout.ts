import { translateCopy as _translateCopy } from '../i18n/copy';

/**
 * The whole timeout sentence for each label callers pass, so the label is never
 * a translated fragment dropped into a translated sentence. Labels stay English:
 * they are ids here and in logs.
 */
const TIMEOUT_COPY: Record<string, () => string> = {
  'Wallet network': () => _translateCopy('copy.46b026729598', { defaultValue: 'Wallet network timed out. Please try again.' }),
  'Wallet address': () => _translateCopy('copy.e0e78b0ea250', { defaultValue: 'Wallet address timed out. Please try again.' }),
  'Wallet account': () => _translateCopy('copy.dddd7b822f00', { defaultValue: 'Wallet account timed out. Please try again.' }),
  'Swap route': () => _translateCopy('copy.1952ecd82070', { defaultValue: 'Swap route timed out. Please try again.' }),
  'Token allowance': () => _translateCopy('copy.46b954374a0c', { defaultValue: 'Token allowance timed out. Please try again.' }),
  'Position allowance': () => _translateCopy('copy.3a145293a6b0', { defaultValue: 'Position allowance timed out. Please try again.' }),
  'Token balance': () => _translateCopy('copy.5a5d2d94586f', { defaultValue: 'Token balance timed out. Please try again.' }),
  'Balance': () => _translateCopy('copy.9415b6bf7754', { defaultValue: 'Balance timed out. Please try again.' }),
  'Pool state': () => _translateCopy('copy.4dea37c7724e', { defaultValue: 'Pool state timed out. Please try again.' }),
  'Pool preparation': () => _translateCopy('copy.1a8ff10747a9', { defaultValue: 'Pool preparation timed out. Please try again.' }),
  'Position refresh': () => _translateCopy('copy.2517711c53c7', { defaultValue: 'Position refresh timed out. Please try again.' }),
  'Transaction receipt': () => _translateCopy('copy.a26c02fdb7ba', { defaultValue: 'Transaction receipt timed out. Please try again.' }),
  'Solana RPC': () => _translateCopy('copy.f87a0a5ea200', { defaultValue: 'Solana RPC timed out. Please try again.' }),
  'Prices': () => _translateCopy('copy.b27b5bb05615', { defaultValue: 'Prices timed out. Please try again.' }),
  'Cross-chain quote': () => _translateCopy('copy.2f3ae8cbb598', { defaultValue: 'Cross-chain quote timed out. Please try again.' }),
  'Shared market': () => _translateCopy('copy.010d4549ec72', { defaultValue: 'Shared market timed out. Please try again.' }),
  'Listing registration': () => _translateCopy('copy.bf784eb444ab', { defaultValue: 'Listing registration timed out. Please try again.' }),
};

function timeoutMessage(label: string): string {
  const copy = Object.prototype.hasOwnProperty.call(TIMEOUT_COPY, label) ? TIMEOUT_COPY[label] : undefined;
  if (copy) return copy();
  // "ETH balance", "BNB balance", "DHB balance": a ticker or chain name, which stays as it is.
  const balance = label.match(/^(\S+) balance$/);
  if (balance) return _translateCopy('copy.28f188c0643e', { defaultValue: '{{value1}} balance timed out. Please try again.', value1: balance[1] });
  return _translateCopy('copy.8dd314ec09cd', { defaultValue: '{{value1}} timed out. Please try again.', value1: label });
}

/** Use only for reads/preparation. Never race a submitted transaction against a retry timer. */
export async function readWithTimeout<T>(read: Promise<T>, label: string, milliseconds = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([read, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(timeoutMessage(label))), milliseconds);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
export type OrderStage = 'quote' | 'wallet' | 'balance' | 'tokenApproval' | 'permitApproval' | 'submit' | 'confirm';
