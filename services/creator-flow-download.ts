import { fetch as streamingFetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import env from '../config/env';
import { loadFlowAssets } from './creator-flow-assets';

const MAX_BYTES = 100 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/webm': 'webm' };
function nextChunk(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal) {
  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    const abort = () => reject(new Error('creatorFlow.recoveryPending'));
    signal.addEventListener('abort', abort, { once: true });
    reader.read().then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
    if (signal.aborted) abort();
  });
}

/** Renew an owned private object and stream it to a bounded temporary file. */
export async function downloadFlowAudio(wallet: string, assetId: string, jobId: string, isCurrent: () => boolean,
  limits: { maxBytes?: number; timeoutMs?: number } = {}) {
  const assertCurrent = () => { if (!isCurrent()) throw new Error('SIGN_IN_REQUIRED'); };
  assertCurrent();
  const assets = await loadFlowAssets(wallet, [assetId]); assertCurrent();
  const asset = assets.get(assetId);
  if (asset?.kind !== 'audio' || !asset.url) throw new Error('creatorFlow.missingSavedMedia');
  const url = new URL(asset.url), origin = new URL(env.SUPABASE_URL).origin;
  const expectedPath = `/storage/v1/object/sign/creator-assets/${encodeURIComponent(wallet.toLowerCase())}/${encodeURIComponent(assetId)}/original`;
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password || url.pathname !== expectedPath) throw new Error('creatorFlow.missingSavedMedia');
  const maxBytes = Math.min(MAX_BYTES, Math.max(1, limits.maxBytes || MAX_BYTES));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(60000, Math.max(1, limits.timeoutMs || 30000)));
  let file: File | undefined, handle: ReturnType<File['open']> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, complete = false;
  try {
    const response = await streamingFetch(url.toString(), { redirect: 'error', signal: controller.signal });
    assertCurrent();
    if (!response.ok || response.redirected || new URL(response.url).toString() !== url.toString()) throw new Error('creatorFlow.missingSavedMedia');
    const mimeType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() || '';
    const declared = Number(response.headers.get('Content-Length'));
    if (!mimeType.startsWith('audio/') || declared > maxBytes || !response.body) throw new Error('creator.fileTooLarge');
    const name = `flow-${jobId}.${EXTENSIONS[mimeType] || 'audio'}`;
    file = new File(Paths.cache, name); await file.create({ overwrite: true });
    handle = file.open(); reader = response.body.getReader();
    let size = 0;
    for (;;) {
      assertCurrent();
      if (controller.signal.aborted) throw new Error('creatorFlow.recoveryPending');
      const chunk = await nextChunk(reader, controller.signal);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) { controller.abort(); throw new Error('creator.fileTooLarge'); }
      assertCurrent(); await handle.writeBytes(chunk.value);
    }
    if (!size || controller.signal.aborted) throw new Error('creatorFlow.missingSavedMedia');
    handle.close(); handle = undefined; complete = true;
    const ownedFile = file;
    return { uri: ownedFile.uri, name, mimeType, size, cleanup: async () => { try { await ownedFile.delete(); } catch {} } };
  } finally {
    clearTimeout(timeout); controller.abort();
    if (reader) void reader.cancel().catch(() => {});
    handle?.close();
    if (!complete && file) { try { await file.delete(); } catch {} }
  }
}
