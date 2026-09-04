/**
 * What a one-segment link means.
 *
 * `dehub.io/mal.eth` has to open a profile, and `dehub.io/favicon.ico` must
 * not. This is the mobile half of a rule dehubweb learned expensively: its edge
 * worker made the same "does the first segment contain a dot?" judgement in
 * four places, drifted, and a verified ENS handle stopped resolving.
 *
 * Two consumers decide it here — getStateFromPath, which actually opens the
 * sheet, and parseDeepLink, which reports what a URL is — so both are pinned.
 */

jest.mock('expo-linking', () => ({
  createURL: (path: string) => `dehub://${String(path).replace(/^\/+/, '')}`,
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  getInitialURL: jest.fn().mockResolvedValue(null),
  parse: (url: string) => {
    const withoutScheme = String(url).replace(/^https?:\/\/[^/]+/i, '');
    const [pathname, search = ''] = withoutScheme.split('?');
    const queryParams: Record<string, string> = {};
    for (const pair of search.split('&')) {
      if (!pair) continue;
      const [k, v = ''] = pair.split('=');
      queryParams[decodeURIComponent(k)] = decodeURIComponent(v);
    }
    return { path: pathname.replace(/^\/+/, ''), queryParams };
  },
}));

jest.mock('@react-navigation/native', () => ({
  getStateFromPath: jest.fn(() => ({ routes: [{ name: 'fallback' }] })),
}));

jest.mock('../../libs/deeplink.events', () => ({
  emitProfileDeepLink: jest.fn(),
  emitStageDeepLink: jest.fn(),
}));

import { getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';
import { emitProfileDeepLink } from '../../libs/deeplink.events';
import linkingConfig, { ShareLinks, parseDeepLink } from '../../navigation/linking.config';

const emitProfile = emitProfileDeepLink as jest.Mock;
const fallback = defaultGetStateFromPath as jest.Mock;

/** Run the config's resolver the way React Navigation does. */
const resolve = (path: string) => (linkingConfig.getStateFromPath as any)(path, {});

describe('getStateFromPath — one-segment paths', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens a profile for a plain username', () => {
    resolve('/mal');
    expect(emitProfile).toHaveBeenCalledWith('mal');
  });

  it('opens a profile for a verified ENS handle', () => {
    // The whole point of the change: dehub.io/mal.eth is a profile URL web
    // already serves, and the handle goes to account_info exactly as a
    // username would.
    resolve('/mal.eth');
    expect(emitProfile).toHaveBeenCalledWith('mal.eth');
  });

  it('decodes a percent-encoded ENS handle before looking it up', () => {
    // ENS names may be non-ASCII. account_info re-encodes what it is given, so
    // handing it an already-encoded string would look up the literal %d9%85….
    resolve('/%D9%85%D8%B1%D8%AD%D8%A8%D8%A7.eth');
    expect(emitProfile).toHaveBeenCalledWith('مرحبا.eth');
  });

  it('never opens a profile for a file', () => {
    for (const asset of ['/favicon.ico', '/robots.txt', '/apple-app-site-association.json']) {
      resolve(asset);
    }
    expect(emitProfile).not.toHaveBeenCalled();
  });

  it('never opens a profile for a product path', () => {
    for (const route of ['/arcade', '/usernames', '/builder', '/cinema', '/stages']) {
      resolve(route);
    }
    expect(emitProfile).not.toHaveBeenCalled();
  });

  it('never opens a profile for a product path typed in mixed case', () => {
    resolve('/Arcade');
    expect(emitProfile).not.toHaveBeenCalled();
  });

  it('still ignores an OAuth callback rather than reading it as a profile', () => {
    // Already consumed by signInWithGoogle(); resolving it would reset
    // navigation out from under an in-progress sign-in.
    expect(resolve('/auth-callback#access_token=abc')).toBeUndefined();
    expect(emitProfile).not.toHaveBeenCalled();
  });

  it('leaves multi-segment paths to the route table', () => {
    resolve('/app/post/123');
    expect(emitProfile).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalled();
  });
});

describe('parseDeepLink', () => {
  it('reports a .eth handle as a profile', () => {
    expect(parseDeepLink('https://dehub.io/mal.eth')).toEqual({
      type: 'profile',
      params: { username: 'mal.eth' },
    });
  });

  it('reports a plain username as a profile', () => {
    expect(parseDeepLink('https://dehub.io/mal')).toEqual({
      type: 'profile',
      params: { username: 'mal' },
    });
  });

  it('does not report a product path as a profile', () => {
    // This branch excluded 'app' and nothing else, so /usernames came back as
    // the user @usernames.
    expect(parseDeepLink('https://dehub.io/usernames')?.type).not.toBe('profile');
    expect(parseDeepLink('https://dehub.io/builder')?.type).not.toBe('profile');
  });

  it('does not report a file as a profile', () => {
    expect(parseDeepLink('https://dehub.io/favicon.ico')?.type).not.toBe('profile');
  });

  // Web answers every /app section at the bare path too and canonicalises onto
  // it, so a store share link is handed out as dehub.io/stores/<id> now. Both
  // spellings have to mean the same thing here or the shared link stops opening
  // the app.
  it('reads a section with or without the /app prefix', () => {
    const bare = parseDeepLink('https://dehub.io/stores/abc123');
    expect(bare).toEqual(parseDeepLink('https://dehub.io/app/stores/abc123'));
    expect(bare).toEqual({ type: 'store', params: { storeId: 'abc123' } });

    expect(parseDeepLink('https://dehub.io/post/42')).toEqual({
      type: 'post',
      params: { tokenId: '42' },
    });
    expect(parseDeepLink('https://dehub.io/notifications')?.type).toBe('notifications');
    expect(parseDeepLink('https://dehub.io/communities/dehub')).toEqual({
      type: 'community',
      params: { slug: 'dehub' },
    });
  });

  it('still reads the top-level routes that are not /app children', () => {
    // The prefix rule must not swallow these: /arcade is its own URL on the
    // web, not the twin of /app/arcade.
    expect(parseDeepLink('https://dehub.io/arcade')?.type).toBe('arcade');
    expect(parseDeepLink('https://dehub.io/arcade/kings-gambit')).toEqual({
      type: 'arcadeGame',
      params: { slug: 'kings-gambit' },
    });
    expect(parseDeepLink('https://dehub.io/mal')?.type).toBe('profile');
  });
});

describe('ShareLinks', () => {
  it('offers the ENS URL alongside the username one, never instead of it', () => {
    // Two URLs for one profile. The username is what the account is called; a
    // .eth name is a claim on something that can be sold or expire.
    expect(ShareLinks.profile('mal')).toBe('https://dehub.io/mal');
    expect(ShareLinks.ensProfile('mal.eth')).toBe('https://dehub.io/mal.eth');
  });
});
