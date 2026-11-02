/**
 * Web's remix and clip links open their own screens in the app:
 * dehub.io/app/post/<id>/duets, /reactions and dehub.io/clip/<n>.
 */
jest.mock('expo-linking', () => ({
  createURL: (path: string) => `dehub://${String(path).replace(/^\/+/, '')}`,
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  getInitialURL: jest.fn().mockResolvedValue(null),
  parse: (url: string) => ({ path: String(url).replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '').split('?')[0], queryParams: {} }),
}));

jest.mock('@react-navigation/native', () => ({
  getStateFromPath: jest.fn(() => ({ routes: [{ name: 'fallback' }] })),
}));

jest.mock('../../libs/deeplink.events', () => ({
  emitProfileDeepLink: jest.fn(),
  emitStageDeepLink: jest.fn(),
}));

import { emitProfileDeepLink } from '../../libs/deeplink.events';
import linkingConfig, { DeepLinkPaths } from '../../navigation/linking.config';
import { ScreenNames } from '../../navigation/ScreenNames';

function findScreen(screens: any, name: string): any {
  for (const [key, value] of Object.entries(screens ?? {})) {
    if (key === name) return value;
    const nested = findScreen((value as any)?.screens, name);
    if (nested) return nested;
  }
  return null;
}

describe('remix and clip links', () => {
  it('maps duets, reactions and clip paths to their screens', () => {
    const screens = (linkingConfig as any).config.screens;
    expect(findScreen(screens, ScreenNames.RemixList).path).toBe(DeepLinkPaths.POST_DUETS);
    expect(findScreen(screens, ScreenNames.RemixReactions).path).toBe(DeepLinkPaths.POST_REACTIONS);
    expect(findScreen(screens, ScreenNames.PostResolverClip).path).toBe(DeepLinkPaths.CLIP);
  });

  it('never reads /clip/<n> as the profile @clip', () => {
    (linkingConfig.getStateFromPath as any)('/clip/42', {});
    expect(emitProfileDeepLink).not.toHaveBeenCalledWith('clip');
  });
});
