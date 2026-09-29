/**
 * A profile link that opens the app from cold arrives before the profile sheet
 * provider has mounted — NavigationContainer resolves the initial URL first and
 * only then renders its children. It has to wait for the handler, not vanish.
 */

describe('profile deep links', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('replays a link that arrived before the sheet registered', () => {
    const events = require('../../libs/deeplink.events');
    events.emitProfileDeepLink('mal');

    const handler = jest.fn();
    events.setProfileDeepLinkHandler(handler);
    jest.runAllTimers();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('mal');

    // Replayed once, not on every later registration.
    const again = jest.fn();
    events.setProfileDeepLinkHandler(again);
    jest.runAllTimers();
    expect(again).not.toHaveBeenCalled();
  });

  it('delivers straight away when the sheet is already listening', () => {
    const events = require('../../libs/deeplink.events');
    const handler = jest.fn();
    events.setProfileDeepLinkHandler(handler);
    events.emitProfileDeepLink('mal');
    jest.runAllTimers();
    expect(handler).toHaveBeenCalledWith('mal');
  });
});
