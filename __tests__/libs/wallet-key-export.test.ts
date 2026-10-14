import { requireDeviceOwner } from '../../libs/biometric-gate';
import { readPrivateKeyForExport } from '../../libs/wallet-core/export-key';

jest.mock('../../libs/biometric-gate', () => ({ requireDeviceOwner: jest.fn() }));
const verify = requireDeviceOwner as jest.MockedFunction<typeof requireDeviceOwner>;
const KEY = `0x${'11'.repeat(32)}`;

beforeEach(() => { jest.clearAllMocks(); verify.mockResolvedValue('verified'); });

it('verifies again for every export from an already unlocked provider', async () => {
  const order: string[] = [];
  verify.mockImplementation(async () => { order.push('verify'); return 'verified'; });
  const read = jest.fn(async () => { order.push('read'); return KEY; });
  await expect(readPrivateKeyForExport(read, 'Show backup')).resolves.toBe(KEY);
  await expect(readPrivateKeyForExport(read, 'Show backup')).resolves.toBe(KEY);
  expect(order).toEqual(['verify', 'read', 'verify', 'read']);
});

it.each(['cancelled', 'capability unavailable', 'prompt unavailable'])('never reads a key after verification fails: %s', async (reason) => {
  verify.mockRejectedValue(new Error(reason));
  const read = jest.fn(async () => KEY);
  await expect(readPrivateKeyForExport(read, 'Show backup')).rejects.toThrow(reason);
  expect(read).not.toHaveBeenCalled();
});

it('does not retrieve a secret when the export sheet closes during verification', async () => {
  let current = true;
  verify.mockImplementation(async () => { current = false; return 'verified'; });
  const read = jest.fn(async () => KEY);
  await expect(readPrivateKeyForExport(read, 'Show backup', () => current)).resolves.toBeNull();
  expect(read).not.toHaveBeenCalled();
});

it('does not publish a key returned after the sheet closes', async () => {
  let current = true;
  await expect(readPrivateKeyForExport(async () => { current = false; return KEY; }, 'Show backup', () => current)).resolves.toBeNull();
});

it('preserves existing recovery access on a device confirmed to have no lock', async () => {
  verify.mockResolvedValue('unenforceable');
  await expect(readPrivateKeyForExport(async () => KEY, 'Show backup')).resolves.toBe(KEY);
});
