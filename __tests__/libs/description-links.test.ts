import { tokenizeDescription } from '../../libs/description-links';

const DEHUB_WAVE =
  'A bunch of us helping DeHub grow—sharing it, bringing people in, and building something big together.  Click the link below to get started: \n\nhttps://docs.google.com/spreadsheets/d/19w68xX7zGJ7Ck7R-fKjLSxYmVNXT1opGc1B4SVWy2Dk/edit?gid=1213196961#gid=1213196961';

const shown = (text: string, singleLine = false) =>
  tokenizeDescription(text, singleLine).map(t => (t.type === 'link' ? '🔗' : t.value)).join('');
const urls = (text: string) =>
  tokenizeDescription(text).flatMap(t => (t.type === 'link' ? [t.url] : []));

describe('tokenizeDescription', () => {
  it('turns the Dehub Wave sheet link into one 🔗 with the full address', () => {
    expect(urls(DEHUB_WAVE)).toEqual([
      'https://docs.google.com/spreadsheets/d/19w68xX7zGJ7Ck7R-fKjLSxYmVNXT1opGc1B4SVWy2Dk/edit?gid=1213196961#gid=1213196961',
    ]);
    expect(shown(DEHUB_WAVE)).toContain('get started: \n\n🔗');
  });

  it('handles several links, trailing punctuation, www. and brackets', () => {
    const text = 'Site: www.dehub.io. Docs (https://docs.example.org/start), wiki en.wikipedia.org/wiki/Foo_(bar)!';
    expect(urls(text)).toEqual([
      'https://www.dehub.io',
      'https://docs.example.org/start',
      'https://en.wikipedia.org/wiki/Foo_(bar)',
    ]);
    expect(shown(text)).toBe('Site: 🔗. Docs (🔗), wiki 🔗!');
  });

  it('reads markdown links as label + 🔗 and leaves emails and handles as text', () => {
    const text = '[Join the sheet](https://example.com/sheet) or mail hi@dehub.io, ask @mal';
    expect(shown(text)).toBe('Join the sheet 🔗 or mail hi@dehub.io, ask @mal');
    expect(urls(text)).toEqual(['https://example.com/sheet']);
  });

  it('folds line breaks for one-line cards', () => {
    expect(shown('one\n\ntwo https://a.com', true)).toBe('one two 🔗');
  });
});
