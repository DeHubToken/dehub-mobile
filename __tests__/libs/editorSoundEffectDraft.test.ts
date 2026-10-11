import { soundEffectRequest } from '../../libs/editor/soundEffectDraft';

describe('sound-effect requests', () => {
  it('keeps automatic length absent and preserves the sound description', () => {
    expect(soundEffectRequest({ text: '  Door slamming in a stone hall  ', durationSeconds: 0 })).toEqual({
      task: 'sfx', text: 'Door slamming in a stone hall', loop: false, promptInfluence: 0.3, outputFormat: 'mp3_44100_128',
    });
  });
  it.each([0.5, 2.75, 30])('keeps the exact %s-second loop request', duration => {
    expect(soundEffectRequest({ text: 'Rain', durationSeconds: duration, loop: true })).toMatchObject({ durationSeconds: duration, loop: true });
  });
  it.each([-1, 0.49, 30.1, NaN, Infinity])('rejects invalid length %s', duration => {
    expect(() => soundEffectRequest({ text: 'Rain', durationSeconds: duration })).toThrow();
  });
  it.each(['', '  ', 'x'.repeat(1001)])('rejects empty or oversized descriptions', text => {
    expect(() => soundEffectRequest({ text })).toThrow();
  });
});
