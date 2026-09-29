import {
  MINIAPP_NS,
  cleanEmbedUrl,
  cleanExternalUrl,
  cleanHandle,
  cleanPostId,
  composeText,
  ownershipMessage,
  parseAppUrl,
  parseRequest,
  launchUrl,
  syntheticFid,
} from '../../libs/miniapp/protocol';
import { parseDehubLink } from '../../libs/dehub-links';

describe('parseAppUrl', () => {
  it('accepts https apps on their own domains', () => {
    expect(parseAppUrl('https://app.example.com/play?room=1')?.host).toBe('app.example.com');
  });

  it('never frames a dehub origin, which would share our storage', () => {
    expect(parseAppUrl('https://dehub.io/app')).toBeNull();
    expect(parseAppUrl('https://staging.dehub.io')).toBeNull();
    expect(parseAppUrl('https://evil.dehub.net')).toBeNull();
  });

  it('refuses http and script URLs, and allows localhost only in dev mode', () => {
    expect(parseAppUrl('http://app.example.com')).toBeNull();
    expect(parseAppUrl('javascript:alert(1)')).toBeNull();
    expect(parseAppUrl('http://localhost:5173')).toBeNull();
    expect(parseAppUrl('http://localhost:5173', { dev: true })?.port).toBe('5173');
  });
});

describe('parseRequest', () => {
  it('reads SDK requests, as objects or as the strings the app bridge sends', () => {
    const msg = { ns: MINIAPP_NS, v: 1, id: 3, method: 'ready', params: {} };
    expect(parseRequest(msg)).toEqual({ id: 3, method: 'ready', params: {} });
    expect(parseRequest(JSON.stringify(msg))?.method).toBe('ready');
  });

  it('ignores other namespaces, unknown methods and missing ids', () => {
    expect(parseRequest({ ns: 'other', id: 1, method: 'ready' })).toBeNull();
    expect(parseRequest({ ns: MINIAPP_NS, id: 1, method: 'wallet.drain' })).toBeNull();
    expect(parseRequest({ ns: MINIAPP_NS, method: 'ready' })).toBeNull();
    expect(parseRequest('not json')).toBeNull();
  });
});

describe('request sanitising', () => {
  it('keeps handles and post ids to their real shapes', () => {
    expect(cleanHandle('@mal')).toBe('mal');
    expect(cleanHandle('../admin')).toBeNull();
    expect(cleanPostId(2008)).toBe('2008');
    expect(cleanPostId('12; drop')).toBeNull();
  });

  it('opens https links only', () => {
    expect(cleanExternalUrl('https://example.com/x')).toBe('https://example.com/x');
    expect(cleanExternalUrl('javascript:alert(1)')).toBeNull();
    expect(cleanExternalUrl('data:text/html,hi')).toBeNull();
  });

  it('only embeds links back to the app itself in a composed post', () => {
    expect(cleanEmbedUrl('https://app.example.com/r/1', 'app.example.com')).toBe('https://app.example.com/r/1');
    expect(cleanEmbedUrl('https://phish.example/r/1', 'app.example.com')).toBeNull();
    expect(composeText({ text: 'gm', embedUrl: 'https://app.example.com/r/1' }, 'app.example.com')).toBe(
      'gm\nhttps://app.example.com/r/1',
    );
    expect(composeText({ text: 'gm', embedUrl: 'https://phish.example' }, 'app.example.com')).toBe('gm');
  });

  it('never cuts the embed off a long post', () => {
    const embed = 'https://app.example.com/r/1';
    const out = composeText({ text: 'x'.repeat(600), embedUrl: embed }, 'app.example.com');
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out.endsWith(embed)).toBe(true);
  });
});

it('signs the same ownership message the registry checks', () => {
  expect(ownershipMessage('app.example.com')).toBe('dehub mini app ownership\napp.example.com');
});

describe('launchUrl', () => {
  it('carries a shared link\'s query through to the app, but not ours', () => {
    const url = launchUrl('https://app.example.com/play', new URLSearchParams('room=42&from=feed'));
    expect(url?.toString()).toBe('https://app.example.com/play?room=42');
  });

  it('opens a deeper page only on the app\'s own host', () => {
    const deep = new URLSearchParams({ url: 'https://app.example.com/r/7' });
    expect(launchUrl('https://app.example.com', deep)?.pathname).toBe('/r/7');
    const elsewhere = new URLSearchParams({ url: 'https://phish.example/r/7' });
    expect(launchUrl('https://app.example.com', elsewhere)?.host).toBe('app.example.com');
  });
});

describe('syntheticFid', () => {
  it('is stable, negative and never a real Farcaster id', () => {
    const wallet = '0xabcdef0123456789abcdef0123456789abcdef01';
    expect(syntheticFid(wallet)).toBe(syntheticFid(wallet));
    expect(syntheticFid(wallet)).toBeLessThan(0);
    expect(syntheticFid(null)).toBe(0);
  });
});

describe('dehub app links', () => {
  it('cards dehub.io/apps/<slug>, keeps the deep link, and leaves /apps/dev alone', () => {
    const link = parseDehubLink('https://dehub.io/apps/yoink?room=4');
    expect(link?.kind).toBe('app');
    expect(link?.appSlug).toBe('yoink');
    expect(link?.path).toBe('/apps/yoink?room=4');
    expect(parseDehubLink('https://dehub.io/apps/dev')?.kind).not.toBe('app');
  });
});
