import { predictSafeAddress } from './predict-safe-address';
import { translateCopy as _translateCopy } from '../../i18n/copy';

/** Accept only the derived owner or its deterministically predicted Safe. */
export async function assertWalletAddress(owner: string, expected: string): Promise<void> {
  const addressPattern = /^0x[0-9a-f]{40}$/i;
  if (!addressPattern.test(owner) || !addressPattern.test(expected)) {
    throw new Error(_translateCopy('copy.2944a2fcb1fc', { defaultValue: 'The wallet address could not be verified. Nothing was changed.' }));
  }
  if (owner.toLowerCase() === expected.toLowerCase()) return;
  const safe = await predictSafeAddress(owner);
  if (!safe) {
    throw new Error(_translateCopy('copy.87cb52e34545', { defaultValue: 'Wallet verification is temporarily unavailable. Please try again. Nothing was changed.' }));
  }
  if (safe.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(_translateCopy('copy.86c131b5882c', { defaultValue: 'This unlock opens a different wallet than this account expects. Nothing was changed. Contact support or import the correct wallet.' }));
  }
}
