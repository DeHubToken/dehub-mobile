import env from '../config/env';
import { dehubAuthHeaders } from './ai.service';
import { translateCopy } from '../i18n/copy';
import type { SpeakerSegment } from '../libs/editor/speakers';

/** Who talks when in a media file, from the same rate-limited transcription function the studio uses. */
export async function detectSpeakers(file: { uri: string; name: string; mimeType: string }, walletAddress?: string | null): Promise<SpeakerSegment[]> {
  const headers = await dehubAuthHeaders(walletAddress);
  if (!headers['x-dehub-token']) throw new Error(translateCopy('creator.signInToGenerate', { defaultValue: 'Sign in to generate.' }));
  headers.apikey = env.SUPABASE_PUBLISHABLE_KEY;
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  form.append('diarize', 'true');
  form.append('tagAudioEvents', 'false');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(`${env.SUPABASE_EDGE_BASE_URL}/elevenlabs-transcribe`, { method: 'POST', headers, body: form, signal: controller.signal });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || translateCopy('editor.speakers.failed', { defaultValue: 'Could not find the speakers.' }));
    return Array.isArray(result.segments) ? result.segments : [];
  } finally { clearTimeout(timeout); }
}
