/**
 * Download for chat attachments.
 *
 * Photos go to the camera roll (the same path the image viewer and the
 * assistant use). Documents go where the platform keeps files: a folder the
 * person picks on Android (Storage Access Framework, same flow as encrypted
 * DM files and editor exports), the share sheet on iOS, which offers
 * "Save to Files". Only modules already in the installed binary are used.
 */
import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { t } from 'i18next';
import { saveToLibrary } from './assistantMedia';
import { toastError, toastSuccess } from './toast';
import { createLogger } from './logger';

const log = createLogger('saveMessageMedia');

const cacheRoot = (): string => FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';

/** A name safe for a file system, keeping the extension. */
export function safeFileName(name: string | undefined, url: string): string {
  const fromUrl = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || '');
  const raw = (name || fromUrl || 'file').trim();
  const cleaned = raw.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 120);
  return cleaned || 'file';
}

/** Save a chat photo to the gallery. */
export function saveMessageImage(url: string): Promise<void> {
  return saveToLibrary(url, 'image');
}

async function writeToFolder(local: string, directoryUri: string, name: string, mime: string): Promise<void> {
  const destination = await FileSystem.StorageAccessFramework.createFileAsync(directoryUri, name, mime);
  try {
    const info = await FileSystem.getInfoAsync(local);
    const size = info.exists && !info.isDirectory ? info.size ?? 0 : 0;
    const chunk = 3 * 256 * 1024;
    for (let position = 0; position < size; position += chunk) {
      const base64 = await FileSystem.readAsStringAsync(local, {
        encoding: FileSystem.EncodingType.Base64,
        position,
        length: Math.min(chunk, size - position),
      });
      await FileSystem.writeAsStringAsync(destination, base64, {
        encoding: FileSystem.EncodingType.Base64,
        append: position > 0,
      });
    }
  } catch (e) {
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
    throw e;
  }
}

/** Save a chat document under its real name. Resolves true once saved. */
export async function saveMessageFile(url: string, name?: string, mime?: string): Promise<boolean> {
  const fileName = safeFileName(name, url);
  try {
    let local = url;
    if (!url.startsWith('file://')) {
      const target = `${cacheRoot()}dehub_dl_${Date.now()}_${fileName}`;
      const res = await FileSystem.downloadAsync(url, target);
      if (res.status < 200 || res.status >= 300) {
        await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
        throw new Error(`Download failed (${res.status})`);
      }
      local = res.uri;
    }
    if (Platform.OS === 'android') {
      const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted) return false;
      await writeToFolder(local, permission.directoryUri, fileName, mime || 'application/octet-stream');
      toastSuccess(t('dm.fileSaved', { defaultValue: 'File saved' }));
      return true;
    }
    const result = await Share.share({ url: local });
    return result.action !== Share.dismissedAction;
  } catch (err) {
    log.error('file save failed:', err);
    toastError(t('dm.fileSaveFailed', { defaultValue: "Couldn't save the file" }));
    return false;
  }
}
