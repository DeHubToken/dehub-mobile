import env from '../config/env';
import { dehubAuthHeaders } from './ai.service';
import { walletScopedClient } from './supabase';
import { translateCopy } from '../i18n/copy';

// The one-off voice purchase, through the same `stage-voice-clone` route web
// uses, so a voice bought on either works on both and nobody pays twice.
const FUNCTION = 'stage-voice-clone';

export interface VoiceCloneStatus {
  priceDhb: number;
  treasury: string;
  owned: boolean;
  entitled: boolean;
  enabled: boolean;
  voiceName: string | null;
  creditedRetry: boolean;
}

export interface CustomVoice { id: string; elevenlabs_voice_id: string; name: string }

export class VoiceCloneError extends Error {
  /** True when the DHB has already left the wallet, so never say "try again". */
  paid: boolean;
  constructor(message: string, paid = false) { super(message); this.name = 'VoiceCloneError'; this.paid = paid; }
}

async function headersFor(wallet: string) {
  const headers = await dehubAuthHeaders(wallet);
  if (!headers['x-dehub-token']) throw new VoiceCloneError(translateCopy('creator.signInToGenerate', { defaultValue: 'Sign in to generate.' }));
  headers.apikey = env.SUPABASE_PUBLISHABLE_KEY;
  return headers;
}

async function callJson<T>(wallet: string, action: string): Promise<T | null> {
  try {
    const headers = { ...(await headersFor(wallet)), 'Content-Type': 'application/json' };
    const response = await fetch(`${env.SUPABASE_EDGE_BASE_URL}/${FUNCTION}`, { method: 'POST', headers, body: JSON.stringify({ action }) });
    const payload = await response.json().catch(() => null);
    return response.ok && payload && !payload.error ? payload as T : null;
  } catch { return null; }
}

export const fetchVoiceCloneStatus = (wallet: string) => callJson<VoiceCloneStatus>(wallet, 'status');
/** Buying the voice switches Stage dubbing on; this puts it back off. */
export const releaseStageVoice = (wallet: string) => callJson<{ enabled: boolean }>(wallet, 'release');

/** Upload the sample and claim the clone. No `txHash` spends a payment the server already holds. */
export async function submitVoiceClone(wallet: string, sample: { uri: string; name: string; mimeType: string } | null, name: string, txHash: string | null) {
  const form = new FormData();
  if (sample) form.append('file', { uri: sample.uri, name: sample.name, type: sample.mimeType } as unknown as Blob);
  form.append('name', name);
  if (txHash) form.append('txHash', txHash);
  const response = await fetch(`${env.SUPABASE_EDGE_BASE_URL}/${FUNCTION}`, { method: 'POST', headers: await headersFor(wallet), body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw new VoiceCloneError(payload?.error || translateCopy('editor.voiceClone.failed', { defaultValue: 'Voice cloning failed.' }), !!txHash || payload?.code === 'CLONE_FAILED');
  }
  return { voiceId: String(payload.voiceId ?? ''), name: String(payload.name ?? name) };
}

export async function listCustomVoices(wallet: string): Promise<CustomVoice[]> {
  const { data, error } = await walletScopedClient(wallet).from('custom_voices').select('id, elevenlabs_voice_id, name').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CustomVoice[];
}
