const mockFetch = jest.fn(), mockAssets = jest.fn(), mockWrite = jest.fn(), mockClose = jest.fn(), mockDelete = jest.fn();
jest.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockFetch(...args) }));
jest.mock('expo-file-system', () => ({ Paths: { cache: 'file://cache' }, File: class {
  uri: string; constructor(_root: unknown, name: string) { this.uri = `file://cache/${name}`; }
  create() {} open() { return { writeBytes: (...args: unknown[]) => mockWrite(...args), close: () => mockClose() }; }
  delete() { return mockDelete(); }
} }));
jest.mock('../../config/env', () => ({ __esModule: true, default: { SUPABASE_URL: 'https://storage.test' } }));
jest.mock('../../services/creator-flow-assets', () => ({ loadFlowAssets: (...args: unknown[]) => mockAssets(...args) }));
import { downloadFlowAudio } from '../../services/creator-flow-download';
const url = 'https://storage.test/storage/v1/object/sign/creator-assets/owner/asset/original?token=renewed';
function response(chunks: Uint8Array[], options: { mime?: string; redirect?: boolean } = {}) {
  const read = jest.fn(); for (const value of chunks) read.mockResolvedValueOnce({ done: false, value }); read.mockResolvedValue({ done: true });
  const cancel = jest.fn(async () => {});
  return { ok: true, url, redirected: !!options.redirect, headers: new Headers({ 'Content-Type': options.mime || 'audio/wav' }), body: { getReader: () => ({ read, cancel }) } };
}
beforeEach(() => {
  jest.clearAllMocks(); mockWrite.mockResolvedValue(undefined); mockDelete.mockResolvedValue(undefined);
  mockAssets.mockResolvedValue(new Map([['asset', { id: 'asset', kind: 'audio', url }]]));
});
afterEach(() => jest.useRealTimers());
it('renews an owned private object and keeps the actual WAV name and MIME', async () => {
  mockFetch.mockResolvedValue(response([new Uint8Array([1,2])]));
  const file = await downloadFlowAudio('owner', 'asset', 'job', () => true);
  expect(mockAssets).toHaveBeenCalledWith('owner', ['asset']);
  expect(mockFetch).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: 'error', signal: expect.anything() }));
  expect(file).toMatchObject({ name: 'flow-job.wav', mimeType: 'audio/wav', size: 2 });
  expect(mockWrite).toHaveBeenCalledTimes(1); await file.cleanup(); expect(mockDelete).toHaveBeenCalled();
});
it('stops a chunked stream before writing bytes beyond the limit', async () => {
  mockFetch.mockResolvedValue(response([new Uint8Array([1]), new Uint8Array([2])]));
  await expect(downloadFlowAudio('owner', 'asset', 'job', () => true, { maxBytes: 1 })).rejects.toThrow('creator.fileTooLarge');
  expect(mockWrite).toHaveBeenCalledTimes(1); expect(mockClose).toHaveBeenCalled(); expect(mockDelete).toHaveBeenCalled();
});
it('rejects redirects and URLs outside the exact owned storage object', async () => {
  mockAssets.mockResolvedValueOnce(new Map([['asset', { id: 'asset', kind: 'audio', url: 'https://other.test/audio.wav' }]]));
  await expect(downloadFlowAudio('owner', 'asset', 'job', () => true)).rejects.toThrow('creatorFlow.missingSavedMedia');
  expect(mockFetch).not.toHaveBeenCalled();
  mockFetch.mockResolvedValue(response([], { redirect: true }));
  await expect(downloadFlowAudio('owner', 'asset', 'job', () => true)).rejects.toThrow('creatorFlow.missingSavedMedia');
});
it('bounds a stalled reader by the download deadline', async () => {
  jest.useFakeTimers();
  mockFetch.mockResolvedValue({ ...response([]), body: { getReader: () => ({ read: () => new Promise(() => {}), cancel: async () => {} }) } });
  const outcome = downloadFlowAudio('owner', 'asset', 'job', () => true, { timeoutMs: 30 }).then(() => null, error => error);
  await jest.advanceTimersByTimeAsync(31);
  expect(await outcome).toMatchObject({ message: 'creatorFlow.recoveryPending' });
  expect(mockDelete).toHaveBeenCalled();
});
