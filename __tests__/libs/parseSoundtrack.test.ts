import { buildSoundtrackTag, parseSoundtrack, stripSoundtrackTag } from '../../libs/parseSoundtrack';

describe('soundtrack metadata', () => {
  it('reads legacy tags and relative audio paths', () => {
    expect(parseSoundtrack('[soundtrack:42:Song:Artist]')?.url).toBe('https://dehubcdn.ams3.cdn.digitaloceanspaces.com/feed-audio/42-audio.mp3');
    expect(parseSoundtrack('[soundtrack:42:Song:Artist:uploads/song.m4a]')?.url).toContain('/uploads/song.m4a');
  });
  it('preserves a full audio URL', () => {
    expect(parseSoundtrack('[soundtrack:42:Song:Artist:https://example.com/song.mp3?x=1]')?.url).toBe('https://example.com/song.mp3?x=1');
  });
  it('round trips punctuation, brackets, Unicode, and percent signs', () => {
    const sound = { tokenId: '42', title: 'Night: [live] 100% 🎵', creator: 'A:B', url: 'https://example.com/song.mp3' };
    expect(parseSoundtrack(buildSoundtrackTag(sound))).toEqual(sound);
    expect(stripSoundtrackTag(`Caption\n${buildSoundtrackTag(sound)}`)).toBe('Caption');
  });
  it('rejects non-media schemes and tolerates legacy percent signs', () => {
    expect(parseSoundtrack('[soundtrack:42:Song:Artist:javascript:alert(1)]')).toBeNull();
    expect(parseSoundtrack('[soundtrack:42:100%:Artist]')?.title).toBe('100%');
  });
});
