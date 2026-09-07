/**
 * Getting generated media off the assistant screen.
 * =================================================
 * Web puts three buttons on a generated image (attach-to-edit, copy, post) and
 * two on a video (download, post). All of them work on a browser blob; none of
 * those primitives exist here, so this is the device-side equivalent:
 *
 *  - `materialise` turns a data: URL or a remote URL into a real cache file,
 *    which is what MediaLibrary, Clipboard and the upload composer all need.
 *  - `saveToLibrary` is web's Download.
 *  - `buildMediaDraft` is web's PostModal hand-off: the Upload screen already
 *    restores a draft's media by URI, so posting generated media needs no new
 *    entry point.
 */

import { Platform, Share } from 'react-native';
import { t } from 'i18next';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Clipboard from 'expo-clipboard';
import { Asset } from 'expo-asset';
import { toastError, toastSuccess } from './toast';
import { createLogger } from './logger';

const log = createLogger('assistantMedia');

const cacheRoot = (): string => FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';

function extensionFor(uri: string, fallback: string): string {
  if (uri.startsWith('data:')) {
    const mime = uri.slice(5).split(';')[0];
    const sub = (mime.split('/')[1] || fallback).split('+')[0];
    return sub || fallback;
  }
  const path = uri.split('?')[0];
  return path.match(/\.([a-z0-9]{2,4})$/i)?.[1] || fallback;
}

/**
 * Write a data: URL or download a remote URL to a cache file and return its
 * file:// URI. Already-local URIs pass straight through.
 */
export async function materialise(uri: string, kind: 'image' | 'video' | 'audio'): Promise<string> {
  if (uri.startsWith('file://')) return uri;

  const fallbackExt = kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : 'png';
  const ext = extensionFor(uri, fallbackExt);
  const target = `${cacheRoot()}dehub_ai_${Date.now()}.${ext}`;

  if (uri.startsWith('data:')) {
    const base64 = uri.split(',')[1];
    if (!base64) throw new Error('Invalid data URL');
    await FileSystem.writeAsStringAsync(target, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return target;
  }

  const { uri: fileUri } = await FileSystem.downloadAsync(uri, target);
  return fileUri;
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
};

/**
 * A `data:image/…;base64,…` URL for a local image.
 *
 * The prefix is not cosmetic. `generate-image` hands `sourceImage` and
 * `logoImage` straight to kie/fal as an image reference, and only accepts a
 * logo at all when it `startsWith('data:image/')`. This app used to send the
 * bare base64 body from `readAsStringAsync`, so every "edit this image" request
 * reached the provider as an unusable string.
 */
export async function toImageDataUrl(uri: string): Promise<string> {
  if (uri.startsWith('data:')) return uri;
  const local = await materialise(uri, 'image');
  const ext = (local.split('?')[0].match(/\.([a-z0-9]{2,4})$/i)?.[1] || 'png').toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'image/png';
  const base64 = await FileSystem.readAsStringAsync(local, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return `data:${mime};base64,${base64}`;
}

/**
 * The bundled DeHub wordmark as a data URL, for the poster studio's logo
 * composite. Bundled asset only — the CDN pointer paths return SPA HTML in
 * production rather than the PNG, which is the trap web's comment warns about.
 */
export async function bundledLogoDataUrl(variant: 'primary' | 'icon' | 'both'): Promise<string> {
  const moduleRef =
    variant === 'icon'
      ? require('../assets/web-icons/dehub-logo-compact.png')
      : require('../assets/web-icons/dehub-logo-white.png');
  const asset = Asset.fromModule(moduleRef);
  await asset.downloadAsync();
  const localUri = asset.localUri || asset.uri;
  if (!localUri) throw new Error('Could not resolve the DeHub logo asset');
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return `data:image/png;base64,${base64}`;
}

/** Save generated media to the camera roll. Web's Download button. */
export async function saveToLibrary(uri: string, kind: 'image' | 'video'): Promise<void> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      toastError('Allow photo library access to save this');
      return;
    }
    const local = await materialise(uri, kind);
    await MediaLibrary.saveToLibraryAsync(local);
    toastSuccess(kind === 'video' ? 'Video saved' : 'Image saved');
  } catch (err) {
    log.error('save failed:', err);
    toastError(kind === 'video' ? 'Failed to save video' : 'Failed to save image');
  }
}

const AUDIO_MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
};

/**
 * Get generated audio off the screen. Web offers a straight download; the
 * camera roll will not take an audio file, and there is no expo-sharing here.
 *
 * iOS: the platform share sheet (core `Share`) carries the file URL into
 * Files, a DM or anywhere else.
 *
 * Android: core `Share` only carries text there, so the track never left the
 * device. Write the file into a folder the user picks through the Storage
 * Access Framework instead, the same path the JSON export uses.
 */
export async function shareAudio(uri: string): Promise<void> {
  try {
    const local = await materialise(uri, 'audio');
    if (Platform.OS === 'android') {
      const permission =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted) return;
      const ext = (local.split('?')[0].match(/\.([a-z0-9]{2,4})$/i)?.[1] || 'mp3').toLowerCase();
      const target = await FileSystem.StorageAccessFramework.createFileAsync(
        permission.directoryUri,
        `dehub_ai_${Date.now()}.${ext}`,
        AUDIO_MIME_BY_EXT[ext] || 'audio/mpeg',
      );
      const base64 = await FileSystem.readAsStringAsync(local, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await FileSystem.writeAsStringAsync(target, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      toastSuccess(t('assistant.audioSaved'));
      return;
    }
    await Share.share({ url: local, message: t('assistant.generatedWithAssistant') });
  } catch (err) {
    log.error('share failed:', err);
    toastError(t('assistant.audioSaveFailed'));
  }
}

/**
 * Copy an image to the clipboard. Web copies the blob itself; expo-clipboard
 * takes base64, so a remote URL has to be fetched down first.
 */
export async function copyImage(uri: string): Promise<void> {
  try {
    let base64: string;
    if (uri.startsWith('data:')) {
      base64 = uri.split(',')[1] || '';
    } else {
      const local = await materialise(uri, 'image');
      base64 = await FileSystem.readAsStringAsync(local, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
    if (!base64) throw new Error('Nothing to copy');
    await Clipboard.setImageAsync(base64);
    toastSuccess('Image copied');
  } catch (err) {
    log.error('copy failed:', err);
    toastError('Could not copy that image');
  }
}

/**
 * A one-item draft the Upload screen can restore, so "Post" on a generated
 * image or video lands in the normal composer with the media already attached.
 */
export async function buildMediaDraft(
  uri: string,
  kind: 'image' | 'video',
): Promise<Record<string, unknown>> {
  const local = await materialise(uri, kind);
  return {
    id: `ai-${Date.now()}`,
    bodyText: '',
    description: '',
    categories: [],
    imageUris: kind === 'image' ? [local] : [],
    videoUri: kind === 'video' ? local : null,
    thumbnailUri: null,
    coverUri: null,
    monetization: {
      ppvEnabled: false,
      ppvData: { price: '' },
      bountyEnabled: false,
      bountyData: { viewers: '', commenters: '', rewardPerPerson: '' },
      tokenGatedEnabled: false,
      tokenGateData: { minAmount: '' },
    },
    createdAt: Date.now(),
  };
}
