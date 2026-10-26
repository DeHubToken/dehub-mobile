import { creatorAudioIssue, creatorAudioRequest, creatorDialogue, CREATOR_AUDIO_VOICES } from '../libs/creatorAudio';
import { audioResultIssue, MAX_AUDIO_RESULT_BYTES } from '../libs/audioResult';

describe('native Creator audio requests', () => {
  it('keeps automatic SFX duration absent and does not request a paid generation', () => {
    const request = creatorAudioRequest('A door closes', { task: 'sfx', durationSeconds: 0, loop: true });
    expect(request).toEqual({ endpoint: 'elevenlabs-sound-effects', body: { text: 'A door closes', loop: true, outputFormat: 'mp3_44100_128' } });
  });
  it('casts repeated speakers consistently and respects explicit speaker selections', () => {
    const primary = CREATOR_AUDIO_VOICES[0].id;
    const selected = CREATOR_AUDIO_VOICES[3].id;
    const inputs = creatorDialogue('Alice: Hello\nBob: Hi\nAlice: Welcome\na wrapped sentence', primary, { bob: selected });
    expect(inputs).toEqual([{ text: 'Hello', voiceId: primary }, { text: 'Hi', voiceId: selected }, { text: 'Welcome a wrapped sentence', voiceId: primary }]);
    expect(creatorAudioRequest('Alice: Hello\nBob: Hi', { task: 'dialogue' }).endpoint).toBe('elevenlabs-dialogue');
  });
  it('rejects missing or oversized media, unsupported inputs and invalid text before submission', () => {
    expect(creatorAudioIssue('', { task: 'transcribe' })).toBe('creator.audioNeedsFile');
    expect(creatorAudioIssue('x'.repeat(1001), { task: 'sfx' })).toBe('creator.audioTextLimit');
    expect(creatorAudioIssue('Sound', { task: 'sfx', durationSeconds: 31 })).toBe('creator.audioDurationLimit');
    const media = { uri: 'file:///recording.mp4', name: 'recording.mp4', mimeType: 'video/mp4', size: 1000 };
    expect(creatorAudioIssue('', { task: 'voice-changer', media })).toBe('creator.audioNeedsFile');
    expect(creatorAudioIssue('', { task: 'transcribe', media })).toBeNull();
    expect(creatorAudioRequest('', { task: 'isolate', media }).endpoint).toBe('elevenlabs-audio-isolation');
    expect(creatorAudioIssue('', { task: 'isolate', media: { ...media, size: 101 * 1024 * 1024 } })).toBe('creator.fileTooLarge');
    expect(creatorAudioIssue('Hello', { task: 'speech', modelId: 'not-supported' })).toBe('creator.audioInvalidTask');
  });
  it('does not treat an HTML/JSON error or empty/oversized body as playable audio', () => {
    expect(audioResultIssue('audio/mpeg', 123)).toBeNull();
    expect(audioResultIssue('audio/wav; charset=binary', 123)).toBeNull();
    expect(audioResultIssue('application/json', 123)).toBe('creator.audioInvalidResponse');
    expect(audioResultIssue('text/html', 123)).toBe('creator.audioInvalidResponse');
    expect(audioResultIssue('audio/mpeg', 0)).toBe('creator.audioResultTooLarge');
    expect(audioResultIssue('audio/mpeg', MAX_AUDIO_RESULT_BYTES + 1)).toBe('creator.audioResultTooLarge');
  });
});
