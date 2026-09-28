/**
 * dehub.io/launchpad links open the native launchpad screens.
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
import linkingConfig, { parseDeepLink } from '../../navigation/linking.config';

const emitProfile = emitProfileDeepLink as jest.Mock;
const fallback = defaultGetStateFromPath as jest.Mock;


/** Run the config's resolver the way React Navigation does. */
const resolve = (path: string) => (linkingConfig.getStateFromPath as any)(path, {});

beforeEach(() => {
  emitProfile.mockClear();
  fallback.mockClear();
});

describe('launchpad links', () => {
  // Web serves the launchpad at /launchpad and /app/launchpad alike; the routes
  // here are declared once, under /app, and the bare form is rewritten onto it.
  it('rewrites the bare /launchpad paths onto the /app routes', () => {
    resolve('/launchpad');
    expect(fallback).toHaveBeenCalledWith('/app/launchpad', expect.anything());
    resolve('/launchpad/0b6f6c2e-6a55-4d0e-9d0a-1f1c2b3d4e5f');
    expect(fallback).toHaveBeenCalledWith('/app/launchpad/0b6f6c2e-6a55-4d0e-9d0a-1f1c2b3d4e5f', expect.anything());
    expect(emitProfile).not.toHaveBeenCalled();
  });

  it('reads the list, one coin and the create flow', () => {
    expect(parseDeepLink('https://dehub.io/launchpad')).toEqual({ type: 'launchpad', params: {} });
    expect(parseDeepLink('https://dehub.io/app/launchpad/create')).toEqual({ type: 'launchpadCreate', params: {} });
    expect(parseDeepLink('https://dehub.io/launchpad/abc')).toEqual({ type: 'launchpadCoin', params: { mintId: 'abc' } });
  });
});
