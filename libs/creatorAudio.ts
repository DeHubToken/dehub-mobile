export const CREATOR_AUDIO_TASKS = {
  speech: { label: 'creator.audioTaskSpeechLabel', needsMedia: false, usesVoice: true },
  dialogue: { label: 'creator.audioTaskDialogueLabel', needsMedia: false, usesVoice: true },
  sfx: { label: 'creator.audioTaskSfxLabel', needsMedia: false, usesVoice: false },
  'voice-changer': { label: 'creator.audioTaskVoiceChangerLabel', needsMedia: true, usesVoice: true },
  transcribe: { label: 'creator.audioTaskTranscribeLabel', needsMedia: true, usesVoice: false },
  isolate: { label: 'creator.audioTaskIsolateLabel', needsMedia: true, usesVoice: false },
} as const;
export type CreatorAudioTask = keyof typeof CREATOR_AUDIO_TASKS;
export const CREATOR_AUDIO_VOICES = [
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' },
] as const;
export const CREATOR_SPEECH_MODELS = ['eleven_multilingual_v2', 'eleven_v3', 'eleven_turbo_v2_5', 'eleven_flash_v2_5'] as const;
export interface CreatorAudioMedia { uri: string; name: string; mimeType: string; size: number }
export interface CreatorAudioSettings {
  task: CreatorAudioTask;
  voiceId?: string;
  modelId?: string;
  media?: CreatorAudioMedia;
  durationSeconds?: number;
  loop?: boolean;
  speakerVoices?: Record<string, string>;
}

/** Same named-speaker convention as web, with an editable cast per speaker. */
export function creatorDialogue(script: string, primaryVoiceId: string, cast: Record<string, string> = {}) {
  const assigned = new Map<string, string>();
  const inputs: { text: string; voiceId: string }[] = [];
  for (const line of script.split('\n').map(value => value.trim()).filter(Boolean)) {
    const match = line.match(/^([^:]{1,32}):\s*(.+)$/);
    if (!match) { if (inputs.length) inputs[inputs.length - 1].text += ` ${line}`; continue; }
    const name = match[1].trim().toLowerCase();
    if (!assigned.has(name)) assigned.set(name, cast[name] || (assigned.size === 0 ? primaryVoiceId
      : CREATOR_AUDIO_VOICES.filter(voice => voice.id !== primaryVoiceId)[(assigned.size - 1) % 5].id));
    inputs.push({ text: match[2], voiceId: assigned.get(name)! });
  }
  return inputs;
}

export function creatorAudioIssue(text: string, settings: CreatorAudioSettings): string | null {
  const task = CREATOR_AUDIO_TASKS[settings.task];
  if (!task) return 'creator.audioInvalidTask';
  if (task.needsMedia && !settings.media) return 'creator.audioNeedsFile';
  if (settings.media && (!Number.isFinite(settings.media.size) || settings.media.size <= 0 || settings.media.size > 100 * 1024 * 1024)) return 'creator.fileTooLarge';
  if (settings.media && !/^audio\//.test(settings.media.mimeType) && !(settings.task === 'transcribe' || settings.task === 'isolate') ) return 'creator.audioNeedsFile';
  if (settings.media && !/^(audio|video)\//.test(settings.media.mimeType)) return 'creator.audioNeedsFile';
  if (!task.needsMedia && (!text.trim() || text.length > (settings.task === 'sfx' ? 1000 : 5000))) return 'creator.audioTextLimit';
  if (settings.task === 'speech' && settings.modelId && !CREATOR_SPEECH_MODELS.includes(settings.modelId as typeof CREATOR_SPEECH_MODELS[number])) return 'creator.audioInvalidTask';
  if (settings.task === 'dialogue') {
    const lines = creatorDialogue(text, settings.voiceId || CREATOR_AUDIO_VOICES[0].id, settings.speakerVoices);
    if (!lines.length || lines.length > 50) return 'creator.dialogueFormat';
  }
  if (settings.task === 'sfx' && settings.durationSeconds !== undefined && settings.durationSeconds !== 0 &&
    (!Number.isFinite(settings.durationSeconds) || settings.durationSeconds < 0.5 || settings.durationSeconds > 30)) return 'creator.audioDurationLimit';
  return null;
}

export function creatorAudioRequest(text: string, settings: CreatorAudioSettings) {
  const issue = creatorAudioIssue(text, settings);
  if (issue) throw new Error(issue);
  const voiceId = settings.voiceId || CREATOR_AUDIO_VOICES[0].id;
  switch (settings.task) {
    case 'speech': return { endpoint: 'elevenlabs-tts', body: { text, voiceId, modelId: settings.modelId || CREATOR_SPEECH_MODELS[0], outputFormat: 'mp3_44100_128' } };
    case 'dialogue': return { endpoint: 'elevenlabs-dialogue', body: { inputs: creatorDialogue(text, voiceId, settings.speakerVoices), outputFormat: 'mp3_44100_128' } };
    case 'sfx': return { endpoint: 'elevenlabs-sound-effects', body: { text, ...(settings.durationSeconds ? { durationSeconds: settings.durationSeconds } : {}), loop: settings.loop === true, outputFormat: 'mp3_44100_128' } };
    case 'voice-changer': return { endpoint: 'elevenlabs-voice-changer', fields: { voiceId, outputFormat: 'mp3_44100_128' } };
    case 'transcribe': return { endpoint: 'elevenlabs-transcribe', fields: { diarize: 'true' } };
    case 'isolate': return { endpoint: 'elevenlabs-audio-isolation', fields: { outputFormat: 'mp3_44100_128' } };
  }
}
