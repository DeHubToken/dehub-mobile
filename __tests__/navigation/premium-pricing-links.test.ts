/**
 * dehub.io/premium and /pricing open the native Premium and Pricing screens.
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

describe('premium and pricing links', () => {
  const screens = (linkingConfig.config as any).screens.App.screens;

  // Both are top-level and reserved on the web, so they must reach the route
  // table rather than open a profile sheet for @premium or @pricing.
  it.each([
    ['/premium', 'Premium', 'premium'],
    ['/pricing', 'Pricing', 'pricing'],
  ])('routes %s to the %s screen', (path, screen, pattern) => {
    resolve(path);
    expect(emitProfile).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledWith(path, expect.anything());
    expect(screens[screen]).toBe(pattern);
    expect(parseDeepLink(`https://dehub.io${path}`)?.type).toBe(pattern);
  });
});
