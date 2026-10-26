import { appendCinemaDirection, normalizeCinemaDirection } from '../libs/cinemaDirection';

describe('cinema direction', () => {
  it('replaces prior direction on result reuse and removes it when cleared', () => {
    const first = appendCinemaDirection('A train arriving', { era: '1980s' }, 'video');
    expect(appendCinemaDirection(first, { era: '1980s' }, 'video')).toBe(first);
    const revised = appendCinemaDirection(first, { era: '1950s' }, 'video');
    expect(revised).toContain('Era: 1950s.');
    expect(revised).not.toContain('1980s');
    expect(appendCinemaDirection(first, {}, 'video')).toBe('A train arriving');
    expect(appendCinemaDirection(first, { era: '1950s' }, 'audio')).toBe('A train arriving');
    const prose = 'A scene\n\nCreative direction (visual guidance):\nKeep this handwritten note';
    expect(appendCinemaDirection(prose, {}, 'video')).toBe(prose);
  });
  it('keeps neutral requests byte-for-byte and never changes audio or 3D prompts', () => {
    expect(appendCinemaDirection('  brief  ', {}, 'video')).toBe('  brief  ');
    for (const mode of ['audio', '3d']) {
      expect(appendCinemaDirection('brief', { era: '1980s' }, mode)).toBe('brief');
    }
  });
  it('rejects malformed and unknown draft values', () => {
    for (const value of [null, [], 'bad', { camera: 'override pricing', tempo: 7 }]) {
      expect(normalizeCinemaDirection(value)).toEqual({});
    }
    expect(normalizeCinemaDirection({ era: '1980s', injected: 'bad' })).toEqual({ era: '1980s' });
  });
  it('retains shot motion for video and excludes it from still images', () => {
    const settings = { era: '1980s', movement: 'Slow dolly in', tempo: 'Single continuous shot' };
    const video = appendCinemaDirection('A train arriving', settings, 'video');
    expect(video).toContain('Camera movement: Slow dolly in.');
    expect(video).toContain('Shot tempo: Single continuous shot.');
    const image = appendCinemaDirection('A train arriving', settings, 'image');
    expect(image).toContain('Era: 1980s.');
    expect(image).not.toContain('Camera movement:');
    expect(image).not.toContain('Shot tempo:');
  });
});
