jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
import * as FileSystem from 'expo-file-system/legacy';
import { assertBufferedUploadSizes, checkBufferedUploadSize } from '../../libs/upload-limits';

test('counts mixed MIME types and exact boundaries', () => {
  expect(() => assertBufferedUploadSizes([{ size: 42_069_000, type: 'image/png' }, { size: 57_931_000 }])).not.toThrow();
  expect(() => assertBufferedUploadSizes([{ size: 100_000_001 }])).toThrow();
  expect(() => assertBufferedUploadSizes([{ size: 42_069_001, type: 'image/png' }])).toThrow();
});
test('checks native URI sizes without reading file contents', async () => {
  (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, isDirectory: false, size: 100_000_001 });
  const form = { getParts: () => [{ uri: 'file:///clip.mp4', headers: { 'content-type': 'video/mp4' } }] } as unknown as FormData;
  await expect(checkBufferedUploadSize(form)).rejects.toMatchObject({ status: 413, code: 'UPLOAD_TOO_LARGE' });
});
