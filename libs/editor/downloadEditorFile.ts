import * as FileSystem from 'expo-file-system/legacy';
import { MAX_MEDIA_BYTES, MediaTooLargeError } from './storage';
import { throwIfImportAborted } from './generatedMediaProbe';

/** Stop network work before decoding cancelled or oversized editor media. */
export async function downloadEditorFile(url: string, temporary: string, signal?: AbortSignal) {
  throwIfImportAborted(signal);
  let stopped: Error | undefined;
  let cancellation: Promise<void> | undefined;
  const stop = (error: Error) => {
    if (stopped) return;
    stopped = error;
    cancellation = task.cancelAsync().catch(() => {});
  };
  const task = FileSystem.createDownloadResumable(url, temporary, {}, progress => {
    if (progress.totalBytesWritten > MAX_MEDIA_BYTES || progress.totalBytesExpectedToWrite > MAX_MEDIA_BYTES) {
      stop(new MediaTooLargeError('too large'));
    }
  });
  const abort = () => stop(Object.assign(new Error('Import cancelled'), { name: 'AbortError' }));
  signal?.addEventListener('abort', abort, { once: true });
  try {
    throwIfImportAborted(signal);
    const result = await task.downloadAsync();
    if (stopped) throw stopped;
    throwIfImportAborted(signal);
    if (!result) throw Object.assign(new Error('Import cancelled'), { name: 'AbortError' });
    return result;
  } catch (error) {
    if (stopped) throw stopped;
    throwIfImportAborted(signal);
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    await cancellation;
  }
}
