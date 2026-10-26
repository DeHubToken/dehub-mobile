jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/', downloadAsync: jest.fn(), moveAsync: jest.fn(), deleteAsync: jest.fn(),
}));
jest.mock('expo-media-library', () => ({}));
jest.mock('expo-clipboard', () => ({}));
jest.mock('expo-asset', () => ({ Asset: {} }));
jest.mock('../libs/toast', () => ({ toastError: jest.fn(), toastSuccess: jest.fn() }));
jest.mock('../i18n/copy', () => ({ translateCopy: (key: string) => key }));
import * as FileSystem from 'expo-file-system/legacy';
import { materialise } from '../libs/assistantMedia';

it('preserves WAV extension when downloading an extensionless signed library original', async () => {
  (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({ status: 200, uri: 'file:///cache/download.mp3', headers: { 'Content-Type': 'audio/wav' } });
  expect(await materialise('https://storage.test/wallet/id/original?token=signed', 'audio')).toBe('file:///cache/download.wav');
  expect(FileSystem.moveAsync).toHaveBeenCalledWith({ from: 'file:///cache/download.mp3', to: 'file:///cache/download.wav' });
});

it('preserves existing MP3 and already-local audio paths', async () => {
  jest.clearAllMocks();
  (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({ status: 200, uri: 'file:///cache/download.mp3', headers: { 'content-type': 'audio/mpeg' } });
  expect(await materialise('https://storage.test/original', 'audio')).toBe('file:///cache/download.mp3');
  expect(await materialise('file:///private/result.wav', 'audio')).toBe('file:///private/result.wav');
  expect(FileSystem.moveAsync).not.toHaveBeenCalled();
});
