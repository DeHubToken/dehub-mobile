import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * WhatsApp-like local media management for DM attachments
 * - Stores media under app documents: DeHub/Media/{Images,Videos}
 * - Maintains AsyncStorage mapping: messageId -> { name, type }
 * - Provides copy, download with progress, existence checks, and URI resolve
 */

export type DmMediaType = 'image' | 'video';

const STORAGE_KEY = 'dm-media-map-v1';

export type DmMediaMap = Record<string, { name: string; type: DmMediaType }>; // messageId -> info

let memMap: DmMediaMap | null = null;

function getBaseDir() {
  // Use app document directory. Keep folders human readable; hidden from gallery via .nomedia on Android.
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
  return base.endsWith('/') ? `${base}DeHub/Media` : `${base}/DeHub/Media`;
}

function getTypeDir(type: DmMediaType) {
  return `${getBaseDir()}/${type === 'image' ? 'Images' : 'Videos'}`;
}

async function ensureNomedia() {
  try {
    const nomediaPath = `${getBaseDir()}/.nomedia`;
    const info = await FileSystem.getInfoAsync(nomediaPath);
    if (!info.exists) {
      await FileSystem.writeAsStringAsync(nomediaPath, '');
    }
  } catch {}
}

export async function ensureDirs() {
  const base = getBaseDir();
  const images = getTypeDir('image');
  const videos = getTypeDir('video');
  try {
    const baseInfo = await FileSystem.getInfoAsync(base);
    if (!baseInfo.exists) await FileSystem.makeDirectoryAsync(base, { intermediates: true });
  } catch {}
  try {
    const imgInfo = await FileSystem.getInfoAsync(images);
    if (!imgInfo.exists) await FileSystem.makeDirectoryAsync(images, { intermediates: true });
  } catch {}
  try {
    const vidInfo = await FileSystem.getInfoAsync(videos);
    if (!vidInfo.exists) await FileSystem.makeDirectoryAsync(videos, { intermediates: true });
  } catch {}
  await ensureNomedia();
}

async function loadMap(): Promise<DmMediaMap> {
  if (memMap) return memMap;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    memMap = raw ? (JSON.parse(raw) as DmMediaMap) : {};
  } catch {
    memMap = {};
  }
  return memMap!;
}

async function saveMap(map: DmMediaMap) {
  memMap = map;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

function extFromUri(uri?: string): string {
  if (!uri) return '';
  const q = uri.split('?')[0];
  const i = q.lastIndexOf('.');
  if (i > -1) return q.slice(i + 1).toLowerCase();
  return '';
}

function sanitizeExt(ext: string, fallback: DmMediaType): string {
  const e = (ext || '').toLowerCase();
  if (!e) return fallback === 'image' ? 'jpg' : 'mp4';
  if (/^jpe?g|png|webp|heic$/.test(e)) return e;
  if (/^mp4|mov|m4v|webm$/.test(e)) return e;
  return fallback === 'image' ? 'jpg' : 'mp4';
}

export function localPathFor(type: DmMediaType, name: string): string {
  return `${getTypeDir(type)}/${name}`;
}

export async function getLocalUri(messageId: string): Promise<string | null> {
  const map = await loadMap();
  const hit = map[messageId];
  if (!hit) return null;
  const p = localPathFor(hit.type, hit.name);
  const info = await FileSystem.getInfoAsync(p);
  if (info.exists) return info.uri || p;
  return null;
}

export async function hasLocal(messageId: string): Promise<boolean> {
  return (await getLocalUri(messageId)) != null;
}

export async function setMapping(messageId: string, name: string, type: DmMediaType) {
  const map = await loadMap();
  map[messageId] = { name, type };
  await saveMap(map);
}

export async function removeMapping(messageId: string) {
  const map = await loadMap();
  if (map[messageId]) {
    delete map[messageId];
    await saveMap(map);
  }
}

function randomName(prefix: string, ext: string) {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${stamp}_${rand}.${ext}`;
}

export type CopyPickedResult = { localUri: string; name: string };

/**
 * Copy a picked file into our managed directory immediately on send.
 * Returns the stable localUri and generated file name. Does NOT set mapping (no messageId yet).
 */
export async function copyPickedToLocal(pickedUri: string, type: DmMediaType): Promise<CopyPickedResult> {
  await ensureDirs();
  const ext = sanitizeExt(extFromUri(pickedUri), type);
  const name = randomName(type === 'image' ? 'IMG' : 'VID', ext);
  const dest = localPathFor(type, name);
  await FileSystem.copyAsync({ from: pickedUri, to: dest });
  return { localUri: dest, name };
}

export type DownloadResult = { localUri: string; name: string };

/**
 * Download a remote URL into our managed directory, attach to messageId mapping.
 */
export async function downloadToLocal(url: string, messageId: string, type: DmMediaType, onProgress?: (pct: number) => void): Promise<DownloadResult> {
  await ensureDirs();
  const ext = sanitizeExt(extFromUri(url), type);
  const name = randomName(type === 'image' ? 'IMG' : 'VID', ext);
  const dest = localPathFor(type, name);

  const resumable = FileSystem.createDownloadResumable(
    url,
    dest,
    {},
    (data) => {
      if (!onProgress) return;
      try {
        const pct = data.totalBytesExpectedToWrite > 0
          ? Math.min(100, Math.max(0, Math.round((data.totalBytesWritten / data.totalBytesExpectedToWrite) * 100)))
          : 0;
        onProgress(pct);
      } catch {}
    }
  );
  const res = await resumable.downloadAsync();
  if (!res || !res.uri) throw new Error('Download failed');
  await setMapping(messageId, name, type);
  return { localUri: dest, name };
}

/**
 * Resolve which URI should be used for display: prefers local mapping if present.
 */
export async function resolveDisplayUri(messageId: string, fallbackUrl?: string): Promise<string | undefined> {
  const local = await getLocalUri(messageId);
  if (local) return local;
  return fallbackUrl;
}
