jest.mock('../../services/supabase', () => ({ supabase: {} }));
jest.mock('../../libs/storage-upload', () => ({
  contentTypeForExtension: jest.fn(),
  fileExtension: jest.fn(),
  uploadLocalFileToBucket: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-0000-0000-000000000000' }));

import { tokenizeEmoji } from '../../libs/emoji/tokens';
import { normaliseShortcode, parseEmojiSource } from '../../libs/emoji/custom-emoji';
import { loadShortcodes } from '../../libs/emoji/shortcodes';

describe('tokenizeEmoji', () => {
  it('finds shortcodes and Discord emoji among text', () => {
    expect(tokenizeEmoji('gm :fire: and <a:party:123456789012345678>!')).toEqual([
      { kind: 'text', text: 'gm ' },
      { kind: 'shortcode', code: 'fire', raw: ':fire:' },
      { kind: 'text', text: ' and ' },
      { kind: 'discord', name: 'party', id: '123456789012345678', animated: true, raw: '<a:party:123456789012345678>' },
      { kind: 'text', text: '!' },
    ]);
  });

  it('leaves times and lone colons alone', () => {
    expect(tokenizeEmoji('meet at 12:30:45 ok')).toEqual([{ kind: 'text', text: 'meet at 12:30:45 ok' }]);
    expect(tokenizeEmoji('note: this')).toEqual([{ kind: 'text', text: 'note: this' }]);
  });

  it('handles back-to-back codes and +1', () => {
    const codes = tokenizeEmoji(':+1::thumbsup:').filter((t) => t.kind === 'shortcode').map((t) => (t as { code: string }).code);
    expect(codes).toEqual(['+1', 'thumbsup']);
  });
});

describe('parseEmojiSource', () => {
  it('reads Discord codes and CDN links', () => {
    expect(parseEmojiSource('<:pepe:998877665544332211>')).toMatchObject({ name: 'pepe', animated: false, source: 'discord', externalId: '998877665544332211' });
    expect(parseEmojiSource('https://cdn.discordapp.com/emojis/998877665544332211.gif?size=48')).toMatchObject({ animated: true, source: 'discord' });
  });

  it('maps 7TV, BTTV and FFZ pages to their CDN images', () => {
    expect(parseEmojiSource('https://7tv.app/emotes/60ae958e229664e8667aea38')?.imageUrl).toBe('https://cdn.7tv.app/emote/60ae958e229664e8667aea38/2x.webp');
    expect(parseEmojiSource('https://betterttv.com/emotes/5e76d338d6581c3724c0f0b2')?.imageUrl).toBe('https://cdn.betterttv.net/emote/5e76d338d6581c3724c0f0b2/2x');
    expect(parseEmojiSource('https://www.frankerfacez.com/emoticon/381875-KEKW')).toMatchObject({ name: 'KEKW', imageUrl: 'https://cdn.frankerfacez.com/emote/381875/2' });
  });

  it('accepts any image link and upgrades http', () => {
    expect(parseEmojiSource('http://emojis.slackmojis.com/emojis/images/1/party_parrot.gif')).toMatchObject({
      name: 'party_parrot', animated: true, source: 'slack', imageUrl: 'https://emojis.slackmojis.com/emojis/images/1/party_parrot.gif',
    });
  });
});

describe('shortcodes', () => {
  it('normalises names people type', () => {
    expect(normaliseShortcode(':Party Parrot!:')).toBe('party_parrot');
  });

  it('resolves Slack, GitHub and Discord names to the Unicode emoji', async () => {
    const codes = await loadShortcodes();
    expect(codes['+1']).toContain('👍');
    expect(codes.thumbsup).toContain('👍');
    expect(codes.fire).toBe('🔥');
    expect(codes['100']).toBe('💯');
  });
});
