import { POST_TITLE_MAX, splitTitleFromText } from '../../libs/post-title-split';

/** Same text with its whitespace flattened, for "nothing was lost" checks. */
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('splitTitleFromText', () => {
  it('keeps a short write-up whole as the title', () => {
    expect(splitTitleFromText('my dog on the beach')).toEqual({
      title: 'my dog on the beach',
      description: '',
    });
  });

  it('trims the text before measuring it', () => {
    expect(splitTitleFromText('   spaced out  ')).toEqual({
      title: 'spaced out',
      description: '',
    });
  });

  it('handles empty text', () => {
    expect(splitTitleFromText('   ')).toEqual({ title: '', description: '' });
  });

  it('spills the overflow into the description instead of dropping it', () => {
    const text = ('word '.repeat(60)).trim(); // 299 characters
    const { title, description } = splitTitleFromText(text);

    expect(title.length).toBeLessThanOrEqual(POST_TITLE_MAX);
    expect(description).not.toBe('');
    expect(flat(title + ' ' + description)).toBe(flat(text));
  });

  it('breaks on a space so the title never stops mid-word', () => {
    const text = 'a'.repeat(100) + ' ' + 'b'.repeat(100);
    const { title, description } = splitTitleFromText(text);

    expect(title).toBe('a'.repeat(100));
    expect(description).toBe('b'.repeat(100));
  });

  it('takes the author line break as the end of the title', () => {
    const text = 'Beach day\n\n' + 'something worth reading '.repeat(10).trim();
    const { title, description } = splitTitleFromText(text);

    expect(title).toBe('Beach day');
    expect(description.startsWith('something worth reading')).toBe(true);
  });

  it('cuts at the cap when one unbroken run overruns it', () => {
    const text = 'x'.repeat(200);
    const { title, description } = splitTitleFromText(text);

    expect(title).toBe('x'.repeat(POST_TITLE_MAX));
    expect(description).toBe('x'.repeat(200 - POST_TITLE_MAX));
  });

  it('ignores a space too early to make a usable title', () => {
    const text = 'clip ' + 'u'.repeat(300);
    const { title } = splitTitleFromText(text);

    expect(title.length).toBe(POST_TITLE_MAX);
    expect(title.startsWith('clip ')).toBe(true);
  });

  it('honours a caller cap smaller than the default', () => {
    const { title, description } = splitTitleFromText('one two three four five', 10);

    expect(title).toBe('one two');
    expect(description).toBe('three four five');
  });
});
