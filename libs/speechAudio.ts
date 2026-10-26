export const MAX_SPEECH_AUDIO_BYTES = 128 * 1024 * 1024;
export type SpeechExportFormat = 'mp3_44100_128' | 'mp3_44100_192' | 'wav_24000' | 'pcm_44100';

function ascii(bytes: Uint8Array, offset: number, text: string): boolean {
  return [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
}

/** Recognize containers from bytes rather than trusting a response label. */
export function audioContainer(buffer: ArrayBuffer): 'mp3' | 'wav' | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4 || bytes.length > MAX_SPEECH_AUDIO_BYTES) return null;
  const mpegFrame = (offset: number) => bytes.length >= offset + 4 && bytes[offset] === 0xff &&
    (bytes[offset + 1] & 0xe0) === 0xe0 && (bytes[offset + 1] & 0x18) !== 0x08 &&
    (bytes[offset + 1] & 0x06) !== 0 && (bytes[offset + 2] & 0xf0) !== 0 &&
    (bytes[offset + 2] & 0xf0) !== 0xf0 && (bytes[offset + 2] & 0x0c) !== 0x0c;
  if (mpegFrame(0)) return 'mp3';
  if (ascii(bytes, 0, 'ID3') && bytes.length >= 14 && [2, 3, 4].includes(bytes[3]) &&
    [bytes[6], bytes[7], bytes[8], bytes[9]].every(byte => byte < 128)) {
    const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
    if (mpegFrame(10 + size + (bytes[3] === 4 && (bytes[5] & 0x10) ? 10 : 0))) return 'mp3';
  }
  if (bytes.length < 44 || !ascii(bytes, 0, 'RIFF') || !ascii(bytes, 8, 'WAVE')) return null;
  const view = new DataView(buffer);
  const end = view.getUint32(4, true) + 8;
  if (end > bytes.length || end < 44) return null;
  let formatFound = false;
  let dataFound = false;
  for (let offset = 12; offset + 8 <= end;) {
    const size = view.getUint32(offset + 4, true);
    if (offset + 8 + size > end) return null;
    if (ascii(bytes, offset, 'fmt ')) {
      if (size < 16 || ![1, 3, 0xfffe].includes(view.getUint16(offset + 8, true)) ||
        view.getUint16(offset + 10, true) < 1 || view.getUint32(offset + 12, true) < 1 ||
        view.getUint16(offset + 20, true) < 1) return null;
      formatFound = true;
    }
    if (ascii(bytes, offset, 'data') && size > 0) dataFound = true;
    offset += 8 + size + (size % 2);
  }
  return formatFound && dataFound ? 'wav' : null;
}

/** ElevenLabs TTS PCM is documented mono signed16 little-endian, without a container. */
export function frameSpeechPcm(buffer: ArrayBuffer, sampleRate: 24000 | 44100): ArrayBuffer {
  if (!buffer.byteLength || buffer.byteLength % 2 || buffer.byteLength > MAX_SPEECH_AUDIO_BYTES - 44) throw new Error('Invalid PCM speech response');
  const result = new ArrayBuffer(44 + buffer.byteLength);
  const bytes = new Uint8Array(result);
  const view = new DataView(result);
  const text = (offset: number, value: string) => [...value].forEach((char, i) => { bytes[offset + i] = char.charCodeAt(0); });
  text(0, 'RIFF'); view.setUint32(4, 36 + buffer.byteLength, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, buffer.byteLength, true); bytes.set(new Uint8Array(buffer), 44);
  return result;
}

export function speechProviderFormat(format: unknown): string {
  return format === 'wav_24000' ? 'wav_24000' : format === 'pcm_44100' ? 'pcm_44100'
    : format === 'mp3_44100_192' ? format : 'mp3_44100_128';
}

export function prepareSpeechAudio(buffer: ArrayBuffer, format: unknown, contentType: string | null) {
  const container = audioContainer(buffer);
  const wantsWave = format === 'wav_24000' || format === 'pcm_44100';
  if (wantsWave) {
    if (container === 'wav') {
      const bytes = new Uint8Array(buffer);
      const view = new DataView(buffer);
      const rate = format === 'wav_24000' ? 24000 : 44100;
      for (let offset = 12; offset + 24 <= bytes.length;) {
        if (ascii(bytes, offset, 'fmt ')) {
          if (view.getUint16(offset + 8, true) !== 1 || view.getUint16(offset + 10, true) !== 1 ||
            view.getUint32(offset + 12, true) !== rate || view.getUint32(offset + 16, true) !== rate * 2 ||
            view.getUint16(offset + 20, true) !== 2 || view.getUint16(offset + 22, true) !== 16) throw new Error('The speech provider returned an unexpected WAV format');
          return { buffer, contentType: 'audio/wav', extension: 'wav' } as const;
        }
        const size = view.getUint32(offset + 4, true);
        offset += 8 + size + (size % 2);
      }
      throw new Error('The speech provider returned an invalid WAV format');
    }
    if (format === 'wav_24000') throw new Error('The speech provider did not return the requested WAV audio');
    if (container || !/^(audio\/(pcm|l16|raw|x-raw)|application\/octet-stream)(;|$)/i.test(contentType ?? '')) throw new Error('The speech provider did not return the requested PCM audio');
    return { buffer: frameSpeechPcm(buffer, 44100), contentType: 'audio/wav', extension: 'wav' } as const;
  }
  if (container !== 'mp3') throw new Error('The speech provider did not return valid MP3 audio');
  return { buffer, contentType: 'audio/mpeg', extension: 'mp3' } as const;
}
