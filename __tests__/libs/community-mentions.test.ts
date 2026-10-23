import { parseCommunityMentions, hasCommunityMentions } from '../../libs/community-mentions';

const parse = parseCommunityMentions;

describe('parseCommunityMentions', () => {
  it('finds a single handle', () => {
    expect(parse('hey @alice look at this')).toEqual({ usernames: ['alice'], here: false });
  });

  it('finds several handles and lowercases them', () => {
    expect(parse('@Alice @BOB ping').usernames).toEqual(['alice', 'bob']);
  });

  it('de-duplicates while keeping first-seen order', () => {
    expect(parse('@bob @alice @bob').usernames).toEqual(['bob', 'alice']);
  });

  it('detects a handle at the very start of the message', () => {
    expect(parse('@alice hi').usernames).toEqual(['alice']);
  });

  // Sentence punctuation is not part of the handle.
  it('strips trailing dots and hyphens', () => {
    expect(parse('ask @alice.').usernames).toEqual(['alice']);
    expect(parse('@bob- said so').usernames).toEqual(['bob']);
  });

  it('keeps interior dots, hyphens and underscores', () => {
    expect(parse('@some.one @a-b @c_d').usernames).toEqual(['some.one', 'a-b', 'c_d']);
  });

  describe('@here', () => {
    it('sets the broadcast flag', () => {
      expect(parse('@here standup in 5')).toEqual({ usernames: [], here: true });
    });

    it('accepts the common aliases', () => {
      expect(parse('@channel').here).toBe(true);
      expect(parse('@everyone').here).toBe(true);
      expect(parse('@HERE').here).toBe(true);
    });

    // The reserved word is a broadcast, never a handle to resolve.
    it('never reports here as a username', () => {
      expect(parse('@here @alice').usernames).toEqual(['alice']);
    });
  });

  describe('things that are not mentions', () => {
    it('ignores an email address', () => {
      expect(parse('mail me at bob@example.com')).toEqual({ usernames: [], here: false });
    });

    it('ignores a bare sigil and a leading digit-only handle boundary', () => {
      expect(parse('@ alone').usernames).toEqual([]);
      expect(parse('cost is 50@ each').usernames).toEqual([]);
    });

    it('ignores a doubled sigil', () => {
      expect(parse('@@alice').usernames).toEqual([]);
    });

    it('handles empty input', () => {
      expect(parse('')).toEqual({ usernames: [], here: false });
      expect(parse(null)).toEqual({ usernames: [], here: false });
      expect(parse(undefined)).toEqual({ usernames: [], here: false });
    });
  });
});

describe('hasCommunityMentions', () => {
  it('is true for a handle or a broadcast, false for neither', () => {
    expect(hasCommunityMentions(parse('@alice'))).toBe(true);
    expect(hasCommunityMentions(parse('@here'))).toBe(true);
    expect(hasCommunityMentions(parse('plain message'))).toBe(false);
  });
});
