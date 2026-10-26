import { audioContainer, frameSpeechPcm, prepareSpeechAudio } from '../libs/speechAudio';

it('frames documented speech samples with real RIFF size, rate, depth and channel count', () => {
  const pcm = new Uint8Array([0, 128, 0, 0, 255, 127]).buffer;
  const wave = prepareSpeechAudio(frameSpeechPcm(pcm, 24000), 'wav_24000', 'audio/mpeg');
  const header = new DataView(wave.buffer);
  expect(audioContainer(wave.buffer)).toBe('wav');
  expect(header.getUint32(4, true)).toBe(42);
  expect(header.getUint16(22, true)).toBe(1);
  expect(header.getUint32(24, true)).toBe(24000);
  expect(header.getUint16(34, true)).toBe(16);
  expect([...new Uint8Array(wave.buffer, 44)]).toEqual([...new Uint8Array(pcm)]);
});
it('rejects malformed audio and incomplete PCM samples', () => {
  expect(() => frameSpeechPcm(new Uint8Array([0]).buffer, 24000)).toThrow('Invalid PCM');
  expect(audioContainer(new Uint8Array([82, 73, 70, 70]).buffer)).toBeNull();
  expect(() => prepareSpeechAudio(new Uint8Array([123, 125, 0, 0]).buffer, undefined, 'audio/mpeg')).toThrow('valid MP3');
});
