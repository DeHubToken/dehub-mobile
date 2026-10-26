jest.mock('../../config/env', () => ({ __esModule: true, default: { SUPABASE_EDGE_BASE_URL: 'https://backend.test/functions/v1', SUPABASE_PUBLISHABLE_KEY: 'public' } }));
jest.mock('../../services/ai.service', () => ({ dehubAuthHeaders: jest.fn() }));
jest.mock('../../i18n/copy', () => ({ translateCopy: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'result-id' }));
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///private/', EncodingType: { Base64: 'base64' }, makeDirectoryAsync: jest.fn(), writeAsStringAsync: jest.fn() }));

import { runCreatorAudio } from '../../services/creator-audio.service';
import { dehubAuthHeaders } from '../../services/ai.service';
import * as FileSystem from 'expo-file-system/legacy';

const http = jest.fn();
const originalReader = global.FileReader;
const originalForm = global.FormData;
class TestFormData {
  parts: [string, unknown][] = [];
  append(key: string, value: unknown) { this.parts.push([key, value]); }
}
class TestReader {
  result = 'data:audio/mpeg;base64,YXVkaW8=';
  onloadend?: () => void;
  readAsDataURL() { this.onloadend?.(); }
}
const audioResponse = (type = 'audio/mpeg', size = 5) => ({ ok: true,
  headers: { get: (name: string) => name === 'Content-Type' ? type : null }, blob: async () => ({ size }),
});

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = http;
  global.FileReader = TestReader as unknown as typeof FileReader;
  global.FormData = TestFormData as unknown as typeof FormData;
  (dehubAuthHeaders as jest.Mock).mockImplementation(async () => ({ 'x-dehub-token': 'owner-token', 'x-wallet-address': 'alice' }));
  http.mockReset().mockResolvedValue(audioResponse());
});
afterAll(() => { global.FileReader = originalReader; global.FormData = originalForm; });

it('authenticates JSON speech and writes a durable private MP3 before returning', async () => {
  expect(await runCreatorAudio('Hello', { task: 'speech' }, 'alice')).toEqual({ audioUrl: 'file:///private/creator-audio/result-id.mp3' });
  expect(dehubAuthHeaders).toHaveBeenCalledWith('alice');
  expect(http).toHaveBeenCalledWith('https://backend.test/functions/v1/elevenlabs-tts', expect.objectContaining({
    headers: expect.objectContaining({ 'x-dehub-token': 'owner-token', 'x-wallet-address': 'alice', apikey: 'public', 'Content-Type': 'application/json' }),
    body: expect.stringContaining('"text":"Hello"'),
  }));
  expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith('file:///private/creator-audio/result-id.mp3', 'YXVkaW8=', { encoding: 'base64' });
});

it('sends native multipart media without setting a JSON content type', async () => {
  const media = { uri: 'file:///recording.mp3', name: 'recording.mp3', mimeType: 'audio/mpeg', size: 100 };
  await runCreatorAudio('', { task: 'voice-changer', media }, 'alice');
  const request = http.mock.calls[0][1];
  expect(request.body).toBeInstanceOf(FormData);
  expect(request.headers['Content-Type']).toBeUndefined();
  expect(request.body.parts).toEqual(expect.arrayContaining([['file', { uri: media.uri, name: media.name, type: 'audio/mpeg' }]]));
});

it('does not request provider work without an authenticated session', async () => {
  (dehubAuthHeaders as jest.Mock).mockResolvedValue({});
  await expect(runCreatorAudio('Hello', { task: 'speech' }, 'alice')).rejects.toThrow('Sign in');
  expect(http).not.toHaveBeenCalled();
});

it('rejects invalid binary data and never writes it as audio', async () => {
  http.mockResolvedValue(audioResponse('application/json'));
  await expect(runCreatorAudio('Hello', { task: 'speech' })).rejects.toThrow('invalid');
  expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
});

it('returns actual transcript text without attempting binary decoding', async () => {
  http.mockResolvedValue({ ok: true, json: async () => ({ text: ' Spoken words. ' }) });
  const media = { uri: 'file:///recording.mp3', name: 'recording.mp3', mimeType: 'audio/mpeg', size: 100 };
  expect(await runCreatorAudio('', { task: 'transcribe', media })).toEqual({ transcript: 'Spoken words.' });
  expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
});

it('aborts an uncertain timed-out request without resubmitting it', async () => {
  jest.useFakeTimers();
  http.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))));
  const pending = runCreatorAudio('Hello', { task: 'speech' });
  const rejection = expect(pending).rejects.toThrow('aborted');
  await Promise.resolve();
  await Promise.resolve();
  jest.advanceTimersByTime(180_000);
  await rejection;
  expect(http).toHaveBeenCalledTimes(1);
  expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  jest.useRealTimers();
});
