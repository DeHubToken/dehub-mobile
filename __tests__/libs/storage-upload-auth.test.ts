jest.mock('expo-file-system/legacy', () => ({
  uploadAsync: jest.fn().mockResolvedValue({ status: 200, body: '{}' }),
  FileSystemUploadType: { BINARY_CONTENT: 0 },
}));
jest.mock('../../config/env', () => ({ __esModule: true, default: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key' } }));
jest.mock('../../services/supabase', () => ({ supabase: {
  auth: { getSession: jest.fn().mockResolvedValue({ data: null }) },
  storage: { from: jest.fn(() => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: 'https://cdn.example/' + path } }) })) },
} }));
jest.mock('../../libs/auth.utils', () => ({ getAuthUser: jest.fn().mockResolvedValue({ walletAddress: '0x' + 'a'.repeat(40) }) }));
jest.mock('../../libs/wallet-session', () => ({ ensureWalletSession: jest.fn() }));
jest.mock('../../i18n/copy', () => ({ translateCopy: (_key: string, options: { defaultValue: string }) => options.defaultValue }));
import { uploadLocalFileToBucket } from '../../libs/storage-upload';
import { ensureWalletSession } from '../../libs/wallet-session';
import { uploadAsync } from 'expo-file-system/legacy';

beforeEach(() => jest.clearAllMocks());
it('scopes native store uploads to the verified account and carries its signature', async () => {
  (ensureWalletSession as jest.Mock).mockResolvedValue({ token: 'signed' });
  const url = await uploadLocalFileToBucket({ bucket: 'store-media', path: 'listings/a.png', uri: 'file:///a.png' });
  expect(url).toContain('0x' + 'a'.repeat(40) + '/listings/a.png');
  expect(uploadAsync).toHaveBeenCalledWith(expect.stringContaining('/store-media/0x' + 'a'.repeat(40) + '/'), 'file:///a.png', expect.objectContaining({ headers: expect.objectContaining({ 'x-wallet-session': 'signed' }) }));
});
it('never starts a native upload if wallet verification fails', async () => {
  (ensureWalletSession as jest.Mock).mockResolvedValue(null);
  await expect(uploadLocalFileToBucket({ bucket: 'community-media', path: 'a.png', uri: 'file:///a.png' })).rejects.toThrow('Session verification');
  expect(uploadAsync).not.toHaveBeenCalled();
});
