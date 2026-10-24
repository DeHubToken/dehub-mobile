import { requireDeviceOwner } from '../biometric-gate';
import { translateCopy as _translateCopy } from '../../i18n/copy';

/** An unlocked signing provider is not permission to display its private key. */
export async function readPrivateKeyForExport(
  read: () => Promise<unknown>,
  purpose: string,
  isCurrent: () => boolean = () => true,
): Promise<string | null> {
  if (!isCurrent()) return null;
  // Preserve the existing policy for devices confirmed to have no screen lock.
  // Failed capability probes and rejected prompts throw before read is called.
  await requireDeviceOwner(purpose);
  if (!isCurrent()) return null;
  const key = await read();
  if (!isCurrent()) return null;
  if (typeof key !== 'string' || !/^(0x)?[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(_translateCopy('copy.665bff952877', { defaultValue: 'Could not retrieve private key' }));
  }
  return key;
}
