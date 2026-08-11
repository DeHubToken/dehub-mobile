import {
  parseDehubLink,
  findDehubLinks,
  findDehubLink,
  hasDehubLink,
  stripDehubLinks,
  stripDehubLinkMatches,
  dehubLinkLabel,
} from '../../libs/dehub-links';

describe('parseDehubLink', () => {
  it('reads a post link', () => {
    expect(parseDehubLink('https://dehub.io/app/post/12345')).toMatchObject({
      kind: 'post',
      tokenId: '12345',
      path: '/app/post/12345',
    });
  });

  it('treats /app/video/:id as a post', () => {
    expect(parseDehubLink('https://dehub.io/app/video/77')).toMatchObject({
      kind: 'post',
      tokenId: '77',
    });
  });

  it('keeps the query string on the path, so a link to a comment still lands on it', () => {
    const link = parseDehubLink('https://dehub.io/app/post/12345?comment=abc');
    expect(link?.path).toBe('/app/post/12345?comment=abc');
  });

  it('rejects a non-numeric post id', () => {
    expect(parseDehubLink('https://dehub.io/app/post/not-a-number')).toBeNull();
  });

  it('reads a community link with and without the /app prefix', () => {
    expect(parseDehubLink('https://dehub.io/app/communities/dehub')).toMatchObject({
      kind: 'community',
      slug: 'dehub',
    });
    // The marketing side of the site links here; the old regexes hard-coded /app
    // and so never carded these.
    expect(parseDehubLink('https://dehub.io/communities/dehub')).toMatchObject({
      kind: 'community',
      slug: 'dehub',
    });
  });

  it('reads an invite before the community slug swallows "join"', () => {
    expect(parseDehubLink('https://dehub.io/app/communities/join/AB12CD')).toMatchObject({
      kind: 'communityInvite',
      code: 'AB12CD',
    });
  });

  it('separates a store from one of its items by the listing query', () => {
    const storeId = '0f4b1c2d-1111-2222-3333-444455556666';
    const listingId = 'aa11bb22-cccc-dddd-eeee-ffff00001111';

    expect(parseDehubLink(`https://dehub.io/app/stores/${storeId}`)).toMatchObject({
      kind: 'store',
      storeId,
    });
    expect(parseDehubLink(`https://dehub.io/app/stores/${storeId}?listing=${listingId}`)).toMatchObject({
      kind: 'listing',
      storeId,
      listingId,
    });
  });

  it('reads an event link', () => {
    expect(parseDehubLink('https://dehub.io/app/events/9')).toMatchObject({
      kind: 'event',
      eventNumber: '9',
    });
  });

  it('reads a profile link and strips a leading @', () => {
    expect(parseDehubLink('https://dehub.io/sableraven')).toMatchObject({
      kind: 'profile',
      username: 'sableraven',
    });
    expect(parseDehubLink('https://dehub.io/@sableraven')).toMatchObject({
      kind: 'profile',
      username: 'sableraven',
    });
  });

  it('does not mistake a route for a person', () => {
    // /:username is the catch-all on web, so every product page would otherwise
    // parse as a profile that resolves to nothing.
    for (const route of ['pricing', 'premium', 'explore', 'docs', 'app']) {
      expect(parseDehubLink(`https://dehub.io/${route}`)).toBeNull();
    }
  });

  it('refuses to card somebody else\'s host', () => {
    expect(parseDehubLink('https://evil.example/app/post/1')).toBeNull();
    expect(parseDehubLink('https://dehub.io.evil.example/app/post/1')).toBeNull();
  });

  it('accepts our other hosts and bare in-app paths', () => {
    expect(parseDehubLink('https://legacy.dehub.io/app/post/5')).toMatchObject({ kind: 'post' });
    expect(parseDehubLink('dehub.app/app/post/5')).toMatchObject({ kind: 'post' });
    expect(parseDehubLink('/app/post/5')).toMatchObject({ kind: 'post', tokenId: '5' });
  });

  it('does not read a bare path as a profile', () => {
    // "/foo" in a sentence is far more likely to be a path somebody typed.
    expect(parseDehubLink('/sableraven')).toBeNull();
  });

  it('drops the punctuation a sentence leaves on the end of a URL', () => {
    expect(parseDehubLink('https://dehub.io/app/post/12345.')).toMatchObject({ tokenId: '12345' });
    expect(parseDehubLink('https://dehub.io/app/post/12345),')).toMatchObject({ tokenId: '12345' });
  });

  it('ignores a fragment', () => {
    expect(parseDehubLink('https://dehub.io/app/post/12345#top')).toMatchObject({
      kind: 'post',
      path: '/app/post/12345',
    });
  });

  it('returns null for junk', () => {
    expect(parseDehubLink('')).toBeNull();
    expect(parseDehubLink('hello world')).toBeNull();
    expect(parseDehubLink('https://dehub.io')).toBeNull();
  });
});

describe('findDehubLinks', () => {
  it('finds every link in source order', () => {
    const text =
      'look at https://dehub.io/app/post/1 and then https://dehub.io/app/communities/dehub please';
    expect(findDehubLinks(text).map((l) => l.kind)).toEqual(['post', 'community']);
  });

  it('does not double-count a link the absolute pass already claimed', () => {
    const text = 'https://dehub.io/app/communities/dehub';
    expect(findDehubLinks(text)).toHaveLength(1);
  });

  it('finds a bare in-app path alongside a full URL', () => {
    const text = 'see /app/post/2 or https://dehub.io/app/events/3';
    expect(findDehubLinks(text).map((l) => l.kind).sort()).toEqual(['event', 'post']);
  });

  it('ignores links to other sites', () => {
    // Regression: the bare-path pass used to reach inside a rejected foreign
    // URL, read its /app/post/1 as a host-less path — which can only be ours —
    // and card somebody else's link as one of our posts.
    expect(findDehubLinks('https://example.com/app/post/1')).toEqual([]);
    expect(findDehubLinks('example.com/app/post/1')).toEqual([]);
    expect(findDehubLinks('read https://example.com/app/communities/x now')).toEqual([]);
  });

  it('still reads our own link when a foreign one sits beside it', () => {
    const text = 'https://example.com/app/post/1 vs https://dehub.io/app/post/2';
    const found = findDehubLinks(text);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: 'post', tokenId: '2' });
  });

  it('handles empty input', () => {
    expect(findDehubLinks('')).toEqual([]);
    expect(findDehubLinks(null)).toEqual([]);
    expect(findDehubLinks(undefined)).toEqual([]);
  });

  it('findDehubLink returns the first, hasDehubLink the presence', () => {
    const text = 'https://dehub.io/app/post/1 https://dehub.io/app/events/2';
    expect(findDehubLink(text)?.kind).toBe('post');
    expect(hasDehubLink(text)).toBe(true);
    expect(hasDehubLink('nothing here')).toBe(false);
  });
});

describe('stripping', () => {
  it('removes the URL and tidies the whitespace it left behind', () => {
    expect(stripDehubLinks('check this out https://dehub.io/app/post/1')).toBe('check this out');
  });

  it('strips only the links it was given, so a capped surface keeps the rest as text', () => {
    const a = 'https://dehub.io/app/post/1';
    const b = 'https://dehub.io/app/post/2';
    const text = `${a} and ${b}`;
    const [first] = findDehubLinks(text);
    expect(stripDehubLinkMatches(text, [first])).toBe(`and ${b}`);
  });

  it('leaves text with no DeHub links alone', () => {
    expect(stripDehubLinks('just some words')).toBe('just some words');
  });

  it('survives empty input', () => {
    expect(stripDehubLinks('')).toBe('');
    expect(stripDehubLinkMatches(null, [])).toBe('');
  });
});

describe('dehubLinkLabel', () => {
  it('names every kind', () => {
    expect(dehubLinkLabel('post')).toBe('post');
    expect(dehubLinkLabel('listing')).toBe('item');
    expect(dehubLinkLabel('communityInvite')).toBe('community invite');
  });
});
