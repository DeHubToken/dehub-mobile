import env from '../config/env';
import { dehubAuthHeaders } from './ai.service';
import { creatorAudioRequest, type CreatorAudioSettings } from '../libs/creatorAudio';
import { audioResultIssue, MAX_AUDIO_RESULT_BYTES } from '../libs/audioResult';
import { translateCopy } from '../i18n/copy';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

/** Authenticated existing free/rate-limited endpoints; never falls back to a paid provider. */
export async function runCreatorAudio(text: string, settings: CreatorAudioSettings, walletAddress?: string | null): Promise<{ audioUrl?: string; transcript?: string }> {
  const request = creatorAudioRequest(text, settings);
  const headers = await dehubAuthHeaders(walletAddress);
  if (!headers['x-dehub-token']) throw new Error(translateCopy('creator.signInToGenerate', { defaultValue: 'Sign in to generate.' }));
  headers.apikey = env.SUPABASE_PUBLISHABLE_KEY;
  let body: string | FormData;
  if (request.fields) {
    const form = new FormData();
    const media = settings.media!;
    form.append('file', { uri: media.uri, name: media.name, type: media.mimeType } as unknown as Blob);
    for (const [key, value] of Object.entries(request.fields)) form.append(key, String(value));
    body = form;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(request.body ?? {});
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(`${env.SUPABASE_EDGE_BASE_URL}/${request.endpoint}`, { method: 'POST', headers, body, signal: controller.signal });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || translateCopy('creator.audioFailed', { defaultValue: 'Could not process that audio.' }));
    }
    if (settings.task === 'transcribe') {
      const result = await response.json();
      const transcript = typeof result.text === 'string' ? result.text.trim() : '';
      if (!transcript) throw new Error(translateCopy('creator.audioNoSpeech', { defaultValue: 'No speech was found in that recording.' }));
      return { transcript };
    }
    const declaredBytes = Number(response.headers.get('Content-Length'));
    if (declaredBytes > MAX_AUDIO_RESULT_BYTES) throw new Error(translateCopy('creator.audioResultTooLarge', { defaultValue: 'The audio result is empty or exceeds 50 MB.' }));
    const blob = await response.blob();
    const issue = audioResultIssue(response.headers.get('Content-Type'), blob.size);
    if (issue) throw new Error(translateCopy(issue, { defaultValue: 'The audio service returned an invalid result.' }));
    const audioUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(translateCopy('creator.audioFailed', { defaultValue: 'Could not process that audio.' })));
      reader.onloadend = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('creator.audioInvalidResponse'));
      reader.readAsDataURL(blob);
    });
    if (!FileSystem.documentDirectory) throw new Error(translateCopy('creator.audioFailed', { defaultValue: 'Could not process that audio.' }));
    const directory = `${FileSystem.documentDirectory}creator-audio/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const uri = `${directory}${Crypto.randomUUID()}.mp3`;
    await FileSystem.writeAsStringAsync(uri, audioUrl.split(',')[1], { encoding: FileSystem.EncodingType.Base64 });
    return { audioUrl: uri };
  } finally { clearTimeout(timeout); }
}
