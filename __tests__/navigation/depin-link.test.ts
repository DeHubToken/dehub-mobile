/**
 * dehub.io/depin opens the native DePin screen.
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

describe('depin link', () => {
  // /depin is top-level on the web and reserved, so it must reach the route
  // table rather than open a profile sheet for @depin.
  it('leaves /depin to the route table', () => {
    resolve('/depin');
    expect(emitProfile).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledWith('/depin', expect.anything());
    expect(parseDeepLink('https://dehub.io/depin')?.type).toBe('depin');
  });
});
