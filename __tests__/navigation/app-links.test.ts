/**
 * What a dehub.io/app link builds, run through React Navigation's real matcher.
 *
 * Two things are pinned. A link that starts the app has Home underneath the
 * page it opens, so the back arrow shows and Android back goes Home instead of
 * closing the app. And an /app link is never dropped: it lands on a screen, or
 * on Home, or opens the web page in the in-app browser.
 */

jest.mock('expo-linking', () => ({
  createURL: (path: string) => `dehub://${String(path).replace(/^\/+/, '')}`,
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  getInitialURL: jest.fn().mockResolvedValue(null),
  parse: jest.fn(),
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  openBrowserAsync: jest.fn().mockResolvedValue({ type: 'opened' }),
}));

jest.mock('@react-navigation/native', () => {
  const core = jest.requireActual('@react-navigation/core');
  return { getStateFromPath: jest.fn(core.getStateFromPath) };
});

jest.mock('../../libs/deeplink.events', () => ({
  emitProfileDeepLink: jest.fn(),
  emitStageDeepLink: jest.fn(),
}));

import { getActionFromState } from '@react-navigation/core';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';
import linkingConfig from '../../navigation/linking.config';

const openBrowser = WebBrowser.openBrowserAsync as jest.Mock;
const openURL = Linking.openURL as jest.Mock;

/** Run the config's resolver the way React Navigation does. */
const resolve = (path: string) =>
  (linkingConfig.getStateFromPath as any)(path, linkingConfig.config);

/** The App stack's route names, bottom to top. */
const appStack = (state: any) => state.routes[0].state.routes.map((r: any) => r.name);

/** The route a link opens. */
const target = (state: any) => {
  const app = state.routes[0].state;
  return app.routes[app.index ?? app.routes.length - 1];
};

/** Let the deferred browser open run. */
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  openBrowser.mockClear();
  openURL.mockClear();
});

describe('a link that starts the app', () => {
  it('puts Home under the page it opens', () => {
    const state = resolve('/app/post/123');
    expect(appStack(state)).toEqual(['Root', 'PostResolver']);
    expect(target(state).params).toEqual({ tokenId: '123' });
  });

  it('does the same for a bare top-level route', () => {
    expect(appStack(resolve('/raffle'))).toEqual(['Root', 'Raffle']);
  });

  it('does not stack a second Home under a link into Home itself', () => {
    expect(appStack(resolve('/app/messages'))).toEqual(['Root']);
  });

  it('still pushes onto the open stack when the app is already running', () => {
    const action: any = getActionFromState(resolve('/app/post/123'), linkingConfig.config as any);
    expect(action.payload.name).toBe('App');
    expect(action.payload.params).toMatchObject({ screen: 'PostResolver', initial: false });
  });
});

describe('/app routes', () => {
  it('pins a shared feature request, whichever name the id comes under', () => {
    expect(target(resolve('/app/features?feature=abc')).params).toEqual({ requestId: 'abc' });
    expect(target(resolve('/features?request=abc&comments=1&comment=c9')).params).toEqual({
      requestId: 'abc',
      comments: '1',
      commentId: 'c9',
    });
    expect(target(resolve('/app/features')).name).toBe('FeatureRequests');
  });

  it('opens governance, one proposal at its comment, and SuperPowers', () => {
    expect(target(resolve('/app/governance')).name).toBe('Governance');
    const proposal = target(resolve('/app/governance/p1?comment=c2'));
    expect(proposal.name).toBe('GovernanceProposal');
    expect(proposal.params).toEqual({ proposalId: 'p1', commentId: 'c2' });
    expect(target(resolve('/app/superpowers')).name).toBe('SuperPowers');
  });

  it('folds /app/usernames, /app/accounts and /app/packs onto their bare routes', () => {
    const usernames = target(resolve('/app/usernames?handle=mal'));
    expect(usernames.name).toBe('Usernames');
    expect(usernames.params).toEqual({ handle: 'mal' });
    expect(target(resolve('/app/accounts')).name).toBe('Accounts');
    expect(target(resolve('/app/packs')).name).toBe('Packs');
    expect(target(resolve('/app/packs/neon')).params).toEqual({ slug: 'neon' });
  });

  it('sends the developer page to the Apps store rather than the player', () => {
    expect(target(resolve('/apps/dev')).name).toBe('Apps');
  });
});

describe('an /app link with no screen', () => {
  it('opens the web page in the in-app browser, never through the OS', async () => {
    expect(resolve('/app/wallet?tab=send')).toBeUndefined();
    await flush();
    expect(openBrowser).toHaveBeenCalledWith('https://dehub.io/app/wallet?tab=send', expect.anything());
    expect(openURL).not.toHaveBeenCalled();
  });

  it('also catches the /app forms that are rewritten before matching', async () => {
    expect(resolve('/app/work')).toBeUndefined();
    await flush();
    expect(openBrowser).toHaveBeenCalledWith('https://dehub.io/app/work', expect.anything());
  });

  it('does not reopen a link that comes straight back', async () => {
    resolve('/app/settings');
    resolve('/app/settings');
    await flush();
    expect(openBrowser).toHaveBeenCalledTimes(1);
  });

  it('takes a bare /app to Home', async () => {
    expect(appStack(resolve('/app'))).toEqual(['Root']);
    await flush();
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it('leaves links outside /app alone', async () => {
    expect(resolve('/nothing/here/at/all')).toBeUndefined();
    expect(resolve('/auth-callback#access_token=abc')).toBeUndefined();
    await flush();
    expect(openBrowser).not.toHaveBeenCalled();
  });
});
