import {
  ASSISTANT_ADDRESS,
  ASSISTANT_USERNAME,
  isAssistantAddress,
  mentionsAssistant,
} from '../../libs/assistant';

describe('libs/assistant', () => {
  describe('isAssistantAddress', () => {
    it('matches the bot address regardless of casing', () => {
      expect(isAssistantAddress(ASSISTANT_ADDRESS)).toBe(true);
      expect(isAssistantAddress(ASSISTANT_ADDRESS.toUpperCase())).toBe(true);
    });

    it('rejects other addresses and empty values', () => {
      expect(isAssistantAddress('0x1111111111111111111111111111111111111111')).toBe(false);
      expect(isAssistantAddress('')).toBe(false);
      expect(isAssistantAddress(undefined)).toBe(false);
      expect(isAssistantAddress(null)).toBe(false);
    });
  });

  describe('mentionsAssistant', () => {
    it('matches the handle anywhere in the message', () => {
      expect(mentionsAssistant('@assistant what is my rank?')).toBe(true);
      expect(mentionsAssistant('can someone ask @Assistant about this')).toBe(true);
    });

    it('leaves @dehub alone, because that is a real user', () => {
      // This used to be a second trigger. It is somebody's handle, so tagging
      // them summoned the bot instead of notifying them.
      expect(mentionsAssistant('hey @dehub how do tips work')).toBe(false);
    });

    it('ignores near-misses so the bot stays quiet', () => {
      // Must be a mention, not a bare word — the bot never volunteers.
      expect(mentionsAssistant('the assistant is useful')).toBe(false);
      expect(mentionsAssistant('email me at bob@assistant.com')).toBe(false);
      // Longer handles are different users, not the bot.
      expect(mentionsAssistant('@assistantbot hello')).toBe(false);
    });

    it('handles empty input', () => {
      expect(mentionsAssistant('')).toBe(false);
      expect(mentionsAssistant(undefined)).toBe(false);
    });

    it('exposes the handle used to build the mention', () => {
      expect(mentionsAssistant(`@${ASSISTANT_USERNAME} hi`)).toBe(true);
    });
  });
});
