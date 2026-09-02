/**
 * The App Store split is decided on the device from Platform.OS, so both
 * stores can ship from one bundle. These pin the two flags to that decision.
 */
describe('config/storefront', () => {
  const load = (os: 'ios' | 'android') => {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: os } }));
    return require('../../config/storefront') as typeof import('../../config/storefront');
  };

  it('hides mature content and DHB unlocks on iOS', () => {
    const s = load('ios');
    expect(s.IS_APP_STORE_BUILD).toBe(true);
    expect(s.MATURE_CONTENT_ENABLED).toBe(false);
    expect(s.DIGITAL_PURCHASES_ENABLED).toBe(false);
  });

  it('leaves Android untouched', () => {
    const s = load('android');
    expect(s.IS_APP_STORE_BUILD).toBe(false);
    expect(s.MATURE_CONTENT_ENABLED).toBe(true);
    expect(s.DIGITAL_PURCHASES_ENABLED).toBe(true);
  });
});
