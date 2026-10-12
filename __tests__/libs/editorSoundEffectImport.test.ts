import { fetch } from 'expo/fetch';
import * as FileSystem from 'expo-file-system/legacy';
import { dehubAuthHeaders } from '../../services/ai.service';
import { probeGeneratedMedia } from '../../libs/editor/generatedMediaProbe';
import { importClipFile } from '../../libs/editor/storage';
import { importSoundEffect, MAX_SOUND_EFFECT_BYTES } from '../../libs/editor/importSoundEffect';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../../config/env', () => ({ __esModule: true, default: { SUPABASE_EDGE_BASE_URL: 'https://edge.test/' } }));
jest.mock('../../services/ai.service', () => ({ dehubAuthHeaders: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'cache://', EncodingType: { Base64: 'base64' }, writeAsStringAsync: jest.fn(), deleteAsync: jest.fn() }));
jest.mock('../../libs/editor/generatedMediaProbe', () => ({ probeGeneratedMedia: jest.fn(), throwIfImportAborted: (signal?: AbortSignal) => { if (signal?.aborted) { const error = new Error('Cancelled'); error.name = 'AbortError'; throw error; } } }));
jest.mock('../../libs/editor/storage', () => ({ importClipFile: jest.fn() }));

function response(chunks = [new Uint8Array([1, 2, 3])], type = 'audio/mpeg', length?: number) {
  const reader = { read: jest.fn(), cancel: jest.fn().mockResolvedValue(undefined), releaseLock: jest.fn() };
  chunks.forEach(value => reader.read.mockResolvedValueOnce({ done: false, value }));
  reader.read.mockResolvedValue({ done: true });
  const reply = { ok: true, headers: { get: (name: string) => name === 'content-type' ? type : length === undefined ? null : String(length) }, body: { getReader: () => reader } };
  jest.mocked(fetch).mockResolvedValue(reply as unknown as Awaited<ReturnType<typeof fetch>>);
  return reader;
}

describe('private sound-effect imports', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(dehubAuthHeaders).mockResolvedValue({ 'x-dehub-token': 'session' });
    jest.mocked(FileSystem.writeAsStringAsync).mockResolvedValue(undefined);
    jest.mocked(FileSystem.deleteAsync).mockResolvedValue(undefined);
    jest.mocked(probeGeneratedMedia).mockResolvedValue({ width: 0, height: 0, duration: 3.04 });
    jest.mocked(importClipFile).mockResolvedValue({ id: 'sound', kind: 'audio', duration: 3.04 } as Awaited<ReturnType<typeof importClipFile>>);
  });
  it('uses authenticated binary routing, response codec and the measured complete duration', async () => {
    const reader = response(undefined, 'audio/x-wav; codecs=pcm');
    const media = await importSoundEffect({ text: 'Door slam', durationSeconds: 5, loop: true }, 'wallet');
    expect(fetch).toHaveBeenCalledWith('https://edge.test/elevenlabs-sound-effects', expect.objectContaining({
      headers: expect.objectContaining({ 'x-dehub-token': 'session' }), body: JSON.stringify({ task: 'sfx', text: 'Door slam', durationSeconds: 5, loop: true, promptInfluence: 0.3, outputFormat: 'mp3_44100_128' }),
    }));
    expect(importClipFile).toHaveBeenCalledWith(expect.objectContaining({ kind: 'audio', mimeType: 'audio/wav', duration: 3.04, fileName: 'door-slam.wav' }));
    expect(media.duration).toBe(3.04); expect(reader.cancel).toHaveBeenCalled();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(expect.stringMatching(/^cache:\/\/editor-sfx-.*\.wav$/), { idempotent: true });
  });
  it('rejects an unauthenticated request before the provider call', async () => {
    jest.mocked(dehubAuthHeaders).mockResolvedValue({});
    await expect(importSoundEffect({ text: 'Door' })).rejects.toThrow('Sign in');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['text/html', 'application/json', 'video/mp4'])('rejects a non-audio %s response', async type => {
    const reader = response(undefined, type);
    await expect(importSoundEffect({ text: 'Door' })).rejects.toThrow();
    expect(reader.cancel).toHaveBeenCalled(); expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });
  it('cancels a header-declared oversized body before reading', async () => {
    const reader = response(undefined, 'audio/mpeg', MAX_SOUND_EFFECT_BYTES + 1);
    await expect(importSoundEffect({ text: 'Door' })).rejects.toThrow('too large');
    expect(reader.read).not.toHaveBeenCalled(); expect(reader.cancel).toHaveBeenCalled();
  });
  it('bounds chunked bodies and rejects empty results', async () => {
    const reader = response([new Uint8Array(MAX_SOUND_EFFECT_BYTES), new Uint8Array(1)]);
    await expect(importSoundEffect({ text: 'Door' })).rejects.toThrow('too large');
    expect(reader.cancel).toHaveBeenCalled(); expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    response([]); await expect(importSoundEffect({ text: 'Door' })).rejects.toThrow('Empty');
  });
  it('cancels while metadata loads, cleans its own temporary file and never copies to the editor', async () => {
    response(); const controller = new AbortController();
    jest.mocked(probeGeneratedMedia).mockImplementationOnce(async () => { controller.abort(); return { width: 0, height: 0, duration: 3 }; });
    await expect(importSoundEffect({ text: 'Door' }, 'wallet', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(importClipFile).not.toHaveBeenCalled(); expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
  });
  it('does not fetch if cancelled during token refresh', async () => {
    const controller = new AbortController();
    jest.mocked(dehubAuthHeaders).mockImplementationOnce(async () => { controller.abort(); return { 'x-dehub-token': 'session' }; });
    await expect(importSoundEffect({ text: 'Door' }, 'wallet', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
