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

  it('reads a stage link, which is top-level rather than /app-scoped', () => {
    expect(
      parseDehubLink('https://dehub.io/stage/6f1c2d84-9a3b-4c7e-8f01-2b5d9e7a4c33'),
    ).toMatchObject({
      kind: 'stage',
      stageId: '6f1c2d84-9a3b-4c7e-8f01-2b5d9e7a4c33',
    });
    // The bare path form has to work too — it is what the composer inserts
    // when the share origin matches the current host.
    expect(parseDehubLink('/stage/6f1c2d84-9a3b-4c7e-8f01-2b5d9e7a4c33')).toMatchObject({
      kind: 'stage',
      stageId: '6f1c2d84-9a3b-4c7e-8f01-2b5d9e7a4c33',
    });
  });

  it('rejects a stage id that is not id-shaped', () => {
    expect(parseDehubLink('https://dehub.io/stage/nope')).toBeNull();
  });

  it('reads the short stage form, which is what web now shares', () => {
    expect(parseDehubLink('https://dehub.io/stages/7')).toMatchObject({
      kind: 'stage',
      stageShortId: '7',
    });
    expect(parseDehubLink('/stages/7')).toMatchObject({
      kind: 'stage',
      stageShortId: '7',
    });
  });

  it('leaves the stages hub and its non-numeric children alone', () => {
    // Bare /stages is the list page, not a stage; anything else under it has
    // no route on either client.
    expect(parseDehubLink('https://dehub.io/stages')).toBeNull();
    expect(parseDehubLink('https://dehub.io/stages/upcoming')).toBeNull();
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
    expect(findDehubLinks('https://example.com/app/post/1')).toEqual([]);
  });

  it('does not card a foreign URL through its path', () => {
    // A card claims the content is DeHub's. The bare-path pass used to match
    // the "/app/post/1" sitting inside an already-rejected foreign URL.
    expect(findDehubLinks('look at https://evil.example/app/post/1 now')).toEqual([]);
    expect(findDehubLinks('https://example.com/communities/dehub')).toEqual([]);
    expect(findDehubLinks('https://dehub.io.attacker.com/app/post/9')).toEqual([]);
    // Scheme-less, which is the case that pins the regex: ABSOLUTE_URL_RE makes
    // https?:// optional, so pass 1 still claims this span and rejects it on the
    // host check. Require the scheme and pass 2 reads the trailing /app/post/1
    // as a host-less path — which can only be ours — and cards it.
    expect(findDehubLinks('example.com/app/post/1')).toEqual([]);
  });

  it('still finds our own link when a foreign one sits beside it', () => {
    const found = findDehubLinks('https://example.com/app/post/1 and https://dehub.io/app/post/2');
    expect(found).toHaveLength(1);
    expect(found[0].tokenId).toBe('2');
  });

  it('handles empty input', () => {
    expect(findDehubLinks('')).toEqual([]);
    expect(findDehubLinks(null)).toEqual([]);
    expect(findDehubLinks(undefined)).toEqual([]);
  });

  it('finds a short stage link written as a bare path', () => {
    // The bare-path pass has to admit the plural: /stages/7 is the form web's
    // share sheet builds whenever the row has a short_id.
    const links = findDehubLinks('town hall tonight — /stages/7 see you there');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ kind: 'stage', stageShortId: '7' });
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
