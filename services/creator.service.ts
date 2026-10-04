import env from '../config/env';
import { dehubAuthHeaders } from './ai.service';
import * as FileSystem from 'expo-file-system/legacy';
import { materialise } from '../libs/assistantMedia';
import { contentTypeForExtension, fileExtension } from '../libs/storage-upload';

export interface CreatorAsset {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'model3d';
  prompt: string;
  modelName: string;
  url?: string;
  transcript?: string;
  createdAt: number;
}

export interface CreatorAssetToSave extends CreatorAsset {
  model: string;
  aspect?: string;
  presetId?: string;
}

async function libraryCall(body: Record<string, unknown>): Promise<any> {
  const headers = await dehubAuthHeaders();
  if (!headers['x-dehub-token']) throw new Error('Sign in to save your generations.');
  const response = await fetch(`${env.SUPABASE_EDGE_BASE_URL}/creator-library`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not save your generation.');
  return data;
}

/** Native streaming upload uses the same private account library as web. */
export async function saveCreatorAsset(asset: CreatorAssetToSave): Promise<void> {
  const { url, ...metadata } = asset;
  const prepared = await libraryCall({ action: 'prepare', id: asset.id, metadata });
  if (prepared.saved) return;
  if (!url || !prepared.path || !prepared.token) throw new Error('No generated media to save.');
  let local: string | undefined;
  try {
    if (asset.kind === 'model3d') {
      if (!FileSystem.cacheDirectory) throw new Error('No cache directory available.');
      const download = await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory}${asset.id}.glb`);
      if (download.status < 200 || download.status >= 300) throw new Error('Could not download the generated model.');
      local = download.uri;
    } else {
      local = await materialise(url, asset.kind);
    }
    const ext = fileExtension({ uri: local }, asset.kind === 'video' ? 'mp4' : asset.kind === 'audio' ? 'mp3' : 'png');
    const upload = await FileSystem.uploadAsync(
      `${env.SUPABASE_URL}/storage/v1/object/upload/sign/creator-assets/${prepared.path}?token=${encodeURIComponent(prepared.token)}`,
      local,
      { httpMethod: 'PUT', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'x-upsert': 'true',
          'Content-Type': asset.kind === 'model3d' ? 'model/gltf-binary' : contentTypeForExtension(ext) } },
    );
    if (upload.status < 200 || upload.status >= 300) throw new Error('Could not upload the generated media.');
    await libraryCall({ action: 'complete', id: asset.id });
  } finally {
    if (local && local !== url) await FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {});
  }
}

export async function listCreatorAssets(offset = 0): Promise<{ jobs: CreatorAsset[]; nextOffset: number | null }> {
  const headers = await dehubAuthHeaders();
  if (!headers['x-dehub-token']) throw new Error('Sign in to see your generations.');
  const response = await fetch(`${env.SUPABASE_EDGE_BASE_URL}/creator-library`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ action: 'list', offset }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load your generations.');
  return data;
}
