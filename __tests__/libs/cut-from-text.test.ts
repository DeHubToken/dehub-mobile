import { cutFromText } from '../../libs/cut-from-text';

describe('cutFromText', () => {
  it('leaves text with nothing to cut exactly as typed', () => {
    const text = 'one\n\n\n\ntwo   three\n  indented';
    expect(cutFromText(text, [])).toBe(text);
    expect(cutFromText(text, ['https://dehub.io/x'])).toBe(text);
  });

  it('keeps the writer’s blank lines and spacing around a cut link', () => {
    expect(cutFromText('Look   at\n\n\nthis https://dehub.io/x now', ['https://dehub.io/x'])).toBe('Look   at\n\n\nthis now');
  });

  it('drops a line that held only the link', () => {
    expect(cutFromText('Hi\nhttps://dehub.io/x\nBye', ['https://dehub.io/x'])).toBe('Hi\nBye');
    expect(cutFromText('Hi\n\nhttps://dehub.io/x', ['https://dehub.io/x'])).toBe('Hi');
  });
});
