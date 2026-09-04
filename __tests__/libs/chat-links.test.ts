import { tokenizeChatText } from '../../libs/chat-links';

describe('tokenizeChatText', () => {
  it('leaves a message with no link as one text token', () => {
    expect(tokenizeChatText('no links here')).toEqual([{ type: 'text', value: 'no links here' }]);
  });

  it('finds a link and keeps the surrounding text intact', () => {
    expect(tokenizeChatText('see https://dehub.io/apk for the build')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', value: 'https://dehub.io/apk', url: 'https://dehub.io/apk' },
      { type: 'text', value: ' for the build' },
    ]);
  });

  it('gives a bare host a scheme to open with', () => {
    expect(tokenizeChatText('dehub.io')).toEqual([
      { type: 'link', value: 'dehub.io', url: 'https://dehub.io' },
    ]);
  });

  it('keeps the brackets around a link as text', () => {
    expect(tokenizeChatText('(www.dehub.io)')).toEqual([
      { type: 'text', value: '(' },
      { type: 'link', value: 'www.dehub.io)', url: 'https://www.dehub.io)' },
    ]);
  });

  it('rebuilds the message exactly, whitespace included', () => {
    const message = '  a\n\nb   https://dehub.io  tail  ';
    expect(tokenizeChatText(message).map((token) => token.value).join('')).toBe(message);
  });

  it('does not link a filename', () => {
    expect(tokenizeChatText('clip.mp4')).toEqual([{ type: 'text', value: 'clip.mp4' }]);
  });

  it('survives a word long enough to exhaust the regex stack', () => {
    // The Chat screen went down on a message like this: Hermes threw
    // `RangeError: Maximum regex stack depth reached` out of render.
    const blob = `a.${'0123456789'.repeat(400)}.com`;
    const tokens = tokenizeChatText(`look ${blob} end`);
    expect(tokens.map((token) => token.value).join('')).toBe(`look ${blob} end`);
  });

  it('still links the rest of a message that carries an oversized word', () => {
    const blob = 'x'.repeat(4000);
    const tokens = tokenizeChatText(`${blob} https://dehub.io`);
    expect(tokens).toContainEqual({
      type: 'link',
      value: 'https://dehub.io',
      url: 'https://dehub.io',
    });
  });

  it('returns nothing for an empty message', () => {
    expect(tokenizeChatText('')).toEqual([]);
    expect(tokenizeChatText(null)).toEqual([]);
  });
});
