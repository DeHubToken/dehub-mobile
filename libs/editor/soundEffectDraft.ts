export const SFX_MAX_PROMPT_CHARS = 1000;
export const SFX_MIN_SECONDS = 0.5;
export const SFX_MAX_SECONDS = 30;

export interface SoundEffectInput { text: string; durationSeconds?: number; loop?: boolean }

/** Zero lets the provider choose the length; never send zero as a duration. */
export function soundEffectRequest(input: SoundEffectInput) {
  const text = input.text.trim();
  if (!text || text.length > SFX_MAX_PROMPT_CHARS) throw new Error('Invalid sound-effect prompt');
  const duration = input.durationSeconds ?? 0;
  if (!Number.isFinite(duration) || (duration !== 0 && (duration < SFX_MIN_SECONDS || duration > SFX_MAX_SECONDS))) {
    throw new Error('Invalid sound-effect duration');
  }
  return { task: 'sfx' as const, text, ...(duration ? { durationSeconds: duration } : {}),
    loop: input.loop === true, promptInfluence: 0.3, outputFormat: 'mp3_44100_128' };
}
