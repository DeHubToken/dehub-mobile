import env from '../config/env';
import { dehubAuthHeaders } from './ai.service';
import * as FileSystem from 'expo-file-system/legacy';
import { materialise } from '../libs/assistantMedia';
import { contentTypeForExtension, fileExtension } from '../libs/storage-upload';
import { translateCopy as _translateCopy } from '../i18n/copy';

export interface CreatorAsset {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'model3d';
  prompt: string;
  modelName: string;
  url?: string;
  posterUrl?: string;
  exportFormat?: string;
  transcript?: string;
  createdAt: number;
  favorite?: boolean;
  hidden?: boolean;
  layerSetId?: string;
}

export interface CreatorAssetToSave extends CreatorAsset {
  model: string;
  aspect?: string;
  presetId?: string;
  resolvedPrompt?: string;
}

export async function libraryCall(body: Record<string, unknown>, walletAddress?: string): Promise<any> {
  const headers = await dehubAuthHeaders(walletAddress);
  if (!headers['x-dehub-token']) throw new Error(_translateCopy("copy.3aea1c77425c", { defaultValue: "Sign in to save your generations." }));
  const response = await fetch(`${env.SUPABASE_EDGE_BASE_URL}/creator-library`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || _translateCopy("copy.d76f182d2c8e", { defaultValue: "Could not save your generation." }));
  return data;
}

/** Native streaming upload uses the same private account library as web. */
export async function saveCreatorAsset(asset: CreatorAssetToSave, walletAddress?: string): Promise<void> {
  const { url, ...metadata } = asset;
  const prepared = await libraryCall({ action: 'prepare', id: asset.id, metadata }, walletAddress);
  if (prepared.saved) return;
  if (!url || !prepared.path || !prepared.token) throw new Error(_translateCopy("copy.75b344eed348", { defaultValue: "No generated media to save." }));
  let local: string | undefined;
  try {
    if (asset.kind === 'model3d') {
      if (!FileSystem.cacheDirectory) throw new Error(_translateCopy("copy.2b3a717c2c9c", { defaultValue: "No cache directory available." }));
      const download = await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory}${asset.id}.glb`);
      if (download.status < 200 || download.status >= 300) throw new Error(_translateCopy("copy.013235f0e197", { defaultValue: "Could not download the generated model." }));
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
    if (upload.status < 200 || upload.status >= 300) throw new Error(_translateCopy("copy.a810f804512d", { defaultValue: "Could not upload the generated media." }));
    await libraryCall({ action: 'complete', id: asset.id }, walletAddress);
  } finally {
    if (local && local !== url) await FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {});
  }
}

export type LibraryOperation = 'favorite' | 'unfavorite' | 'hide' | 'restore';
export async function updateCreatorSelection(ids: string[], operation: LibraryOperation, walletAddress?: string): Promise<{ completedIds: string[]; incompleteIds: string[] }> {
  return libraryCall({ action: 'update-selection', ids, operation }, walletAddress);
}

export async function listCreatorAssets(offset = 0, filter: { hidden?: boolean; favorites?: boolean } = {}): Promise<{ jobs: CreatorAsset[]; nextOffset: number | null }> {
  const headers = await dehubAuthHeaders();
  if (!headers['x-dehub-token']) throw new Error(_translateCopy("copy.095d0fbbfc1e", { defaultValue: "Sign in to see your generations." }));
  const response = await fetch(`${env.SUPABASE_EDGE_BASE_URL}/creator-library`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ action: 'list', offset, ...filter }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || _translateCopy("copy.7c01265024ec", { defaultValue: "Could not load your generations." }));
  return data;
}

export async function saveCreatorPreview(id: string, dataUrl: string, walletAddress?: string): Promise<string> {
  const match = dataUrl.match(/^data:(image\/(?:webp|png|jpeg));base64,(.+)$/);
  if (!match || dataUrl.length > 800_000 || !FileSystem.cacheDirectory) throw new Error(_translateCopy("copy.2561f4b7a96a", { defaultValue: "Invalid generation preview." }));
  const prepared = await libraryCall({ action: 'prepare-preview', id }, walletAddress);
  const local = `${FileSystem.cacheDirectory}${id}-preview`;
  try {
    await FileSystem.writeAsStringAsync(local, match[2], { encoding: FileSystem.EncodingType.Base64 });
    const upload = await FileSystem.uploadAsync(
      `${env.SUPABASE_URL}/storage/v1/object/upload/sign/creator-assets/${prepared.path}?token=${encodeURIComponent(prepared.token)}`,
      local, { httpMethod: 'PUT', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'x-upsert': 'true', 'Content-Type': match[1] } },
    );
    if (upload.status < 200 || upload.status >= 300) throw new Error(_translateCopy("copy.af2cca1e7b95", { defaultValue: "Could not save the preview." }));
    const completed = await libraryCall({ action: 'complete-preview', id }, walletAddress);
    return completed.posterUrl;
  } finally { await FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {}); }
}
