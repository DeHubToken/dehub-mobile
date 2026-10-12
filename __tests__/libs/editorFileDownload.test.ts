import * as FileSystem from 'expo-file-system/legacy';
import { downloadEditorFile } from '../../libs/editor/downloadEditorFile';
jest.mock('expo-file-system/legacy', () => ({ createDownloadResumable: jest.fn() }));
jest.mock('../../libs/editor/storage', () => ({ MAX_MEDIA_BYTES: 500 * 1024 * 1024, MediaTooLargeError: class extends Error {} }));
jest.mock('../../libs/editor/generatedMediaProbe', () => ({ throwIfImportAborted: (signal?: AbortSignal) => { if (signal?.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); } }));
const download = jest.fn(), cancel = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); cancel.mockResolvedValue(undefined);
  jest.mocked(FileSystem.createDownloadResumable).mockReturnValue({ downloadAsync: download, cancelAsync: cancel } as never);
});
it.each(['written', 'expected'])('stops oversized %s byte counts without consuming the full file', async reason => {
  let finish!: (value: undefined) => void;
  download.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  cancel.mockImplementation(async () => { finish(undefined); });
  const pending = downloadEditorFile('https://media.example/large', 'cache/ours.mp4');
  const progress = jest.mocked(FileSystem.createDownloadResumable).mock.calls[0][3]!;
  progress({ totalBytesWritten: reason === 'written' ? 501 * 1024 * 1024 : 1,
    totalBytesExpectedToWrite: reason === 'expected' ? 501 * 1024 * 1024 : -1 });
  expect(cancel).toHaveBeenCalledTimes(1); await expect(pending).rejects.toThrow('too large');
});
it('never starts a transfer for an already cancelled import', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(downloadEditorFile('https://media.example/clip', 'cache/ours.mp4', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(FileSystem.createDownloadResumable).not.toHaveBeenCalled();
});
