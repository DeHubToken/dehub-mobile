/**
 * dehub.io/bridge and /app/bridge open the native Bridge screen.
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

describe('bridge links', () => {
  // Web shares /app/bridge and also answers the bare /bridge.
  it('rewrites the bare /bridge onto the /app route', () => {
    resolve('/bridge');
    expect(fallback).toHaveBeenCalledWith('/app/bridge', expect.anything());
    expect(emitProfile).not.toHaveBeenCalled();
  });

  it('reads the bridge with or without the /app prefix', () => {
    expect(parseDeepLink('https://dehub.io/bridge')).toEqual({ type: 'bridge', params: {} });
    expect(parseDeepLink('https://dehub.io/app/bridge')).toEqual({ type: 'bridge', params: {} });
  });
});
