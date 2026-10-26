export const MAX_AUDIO_RESULT_BYTES = 50 * 1024 * 1024;

export function audioResultIssue(contentType: string | null, bytes: number): string | null {
  if (!contentType || !/^audio\/(mpeg|mp3|mp4|wav|x-wav|ogg)(?:;|$)/i.test(contentType)) return 'creator.audioInvalidResponse';
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_AUDIO_RESULT_BYTES) return 'creator.audioResultTooLarge';
  return null;
}
