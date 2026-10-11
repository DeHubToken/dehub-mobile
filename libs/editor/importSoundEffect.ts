import { fetch } from 'expo/fetch';
import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';
import env from '../../config/env';
import { dehubAuthHeaders } from '../../services/ai.service';
import { generatedMediaFormat, generatedMediaName } from './generatedMedia';
import { probeGeneratedMedia, throwIfImportAborted } from './generatedMediaProbe';
import { importClipFile } from './storage';
import { soundEffectRequest, type SoundEffectInput } from './soundEffectDraft';

export const MAX_SOUND_EFFECT_BYTES = 10 * 1024 * 1024;

/** Keep the binary result private and measure it before placing it on a timeline. */
export async function importSoundEffect(input: SoundEffectInput, wallet?: string | null, signal?: AbortSignal) {
  const request = soundEffectRequest(input);
  throwIfImportAborted(signal);
  const headers = await dehubAuthHeaders(wallet);
  throwIfImportAborted(signal);
  if (!headers['x-dehub-token']) throw new Error('Sign in to generate sound');
  const root = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!root) throw new Error('Editor storage unavailable');
  const response = await fetch(`${env.SUPABASE_EDGE_BASE_URL.replace(/\/$/, '')}/elevenlabs-sound-effects`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(request), signal,
  });
  const reader = response.body?.getReader();
  const abort = () => { void reader?.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  let temporary: string | null = null;
  try {
    throwIfImportAborted(signal);
    if (!response.ok || !reader) throw new Error('Could not generate sound');
    const expected = Number(response.headers.get('content-length') ?? 0);
    if (expected > MAX_SOUND_EFFECT_BYTES) throw new Error('Sound effect is too large');
    const format = generatedMediaFormat('audio', '', response.headers.get('content-type') ?? '');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      throwIfImportAborted(signal);
      const part = await reader.read();
      throwIfImportAborted(signal);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_SOUND_EFFECT_BYTES) throw new Error('Sound effect is too large');
      chunks.push(part.value);
    }
    if (!size) throw new Error('Empty sound effect');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    temporary = `${root}editor-sfx-${Date.now()}-${Math.random().toString(36).slice(2)}.${format.ext}`;
    await FileSystem.writeAsStringAsync(temporary, Buffer.from(bytes).toString('base64'), { encoding: FileSystem.EncodingType.Base64 });
    throwIfImportAborted(signal);
    const dimensions = await probeGeneratedMedia(temporary, 'audio', signal);
    throwIfImportAborted(signal);
    if (!Number.isFinite(dimensions.duration) || !(dimensions.duration && dimensions.duration > 0)) throw new Error('Sound duration is missing');
    const media = await importClipFile({ uri: temporary, kind: 'audio', ...dimensions, mimeType: format.mime,
      fileName: generatedMediaName('audio', request.text, format.ext) });
    throwIfImportAborted(signal);
    return media;
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
    if (temporary) await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => {});
  }
}
