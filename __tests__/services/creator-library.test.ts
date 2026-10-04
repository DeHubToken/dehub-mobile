jest.mock('../../config/env', () => ({ __esModule: true, default: {
  SUPABASE_EDGE_BASE_URL: 'https://backend.test/functions/v1', SUPABASE_URL: 'https://backend.test', SUPABASE_PUBLISHABLE_KEY: 'public',
} }));
jest.mock('../../services/ai.service', () => ({ dehubAuthHeaders: jest.fn().mockResolvedValue({ 'x-dehub-token': 'session' }) }));
jest.mock('../../libs/assistantMedia', () => ({ materialise: jest.fn().mockResolvedValue('file:///cache/result.png') }));
jest.mock('../../libs/storage-upload', () => ({ fileExtension: () => 'png', contentTypeForExtension: () => 'image/png' }));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/', FileSystemUploadType: { BINARY_CONTENT: 0 },
  downloadAsync: jest.fn().mockResolvedValue({ status: 200, uri: 'file:///cache/model.glb' }),
  uploadAsync: jest.fn(), deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

import * as FileSystem from 'expo-file-system/legacy';
import { saveCreatorAsset } from '../../services/creator.service';

const asset = { id: 'native-job-123-image', kind: 'image' as const, prompt: 'a cup', model: 'gemini-3.1-flash-image', modelName: 'Nano Banana 2', createdAt: 1, url: 'https://media.test/result.png' };
const http = jest.fn();
const body = (index: number) => JSON.parse(http.mock.calls[index][1].body);

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = http;
  http.mockResolvedValueOnce({ ok: true, json: async () => ({ path: 'wallet/job/original', token: 'signed-token' }) });
  http.mockResolvedValueOnce({ ok: true, json: async () => ({ saved: true }) });
  (FileSystem.uploadAsync as jest.Mock).mockResolvedValue({ status: 200 });
});

it('marks a generation ready only after its native upload succeeds', async () => {
  await saveCreatorAsset(asset);
  expect(body(0)).toMatchObject({ action: 'prepare', id: asset.id, metadata: { kind: 'image', model: asset.model } });
  expect(body(0).metadata.url).toBeUndefined();
  expect(FileSystem.uploadAsync).toHaveBeenCalledWith(
    'https://backend.test/storage/v1/object/upload/sign/creator-assets/wallet/job/original?token=signed-token',
    'file:///cache/result.png', expect.objectContaining({ httpMethod: 'PUT' }),
  );
  expect(body(1)).toEqual({ action: 'complete', id: asset.id });
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/result.png', { idempotent: true });
});

it('leaves a failed upload unready and keeps generation separate from saving', async () => {
  (FileSystem.uploadAsync as jest.Mock).mockResolvedValue({ status: 503 });
  await expect(saveCreatorAsset(asset)).rejects.toThrow('Could not upload');
  expect(http).toHaveBeenCalledTimes(1);
  expect(FileSystem.deleteAsync).toHaveBeenCalled();
});

it('does not re-upload a generation already saved to the account', async () => {
  http.mockReset().mockResolvedValue({ ok: true, json: async () => ({ saved: true }) });
  await saveCreatorAsset(asset);
  expect(FileSystem.uploadAsync).not.toHaveBeenCalled();
  expect(http).toHaveBeenCalledTimes(1);
});

it('saves the mesh itself using its binary content type', async () => {
  await saveCreatorAsset({ ...asset, kind: 'model3d', url: 'https://media.test/model.glb' });
  expect(FileSystem.uploadAsync).toHaveBeenCalledWith(expect.any(String), 'file:///cache/model.glb',
    expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'model/gltf-binary' }) }));
});
