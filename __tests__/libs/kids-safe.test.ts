import { isKidsBlockedEmoji } from '../../libs/emoji/kids-safe';

describe('isKidsBlockedEmoji', () => {
  it('blocks rude emoji at every skin tone and presentation', () => {
    expect(isKidsBlockedEmoji('🖕')).toBe(true);
    expect(isKidsBlockedEmoji('🖕🏿')).toBe(true);
    expect(isKidsBlockedEmoji('🗡️')).toBe(true);
    expect(isKidsBlockedEmoji('☠️')).toBe(true);
  });

  it('leaves everyday emoji alone', () => {
    for (const e of ['👍', '👍🏽', '❤️', '😂', '🔥', '🚀', '🫡', '💯']) expect(isKidsBlockedEmoji(e)).toBe(false);
  });
});
