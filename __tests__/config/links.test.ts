/**
 * The sign-in, Settings and top-up legal links open these pages in the
 * in-app browser. docs.dhb.gg no longer serves them, so they live on the
 * main site docs surface.
 */
jest.mock('../../config/env', () => ({ __esModule: true, default: { LEGACY_APP_ORIGIN: '' } }));

import { PRIVACY_POLICY_LINK, TERMS_OF_SERVICE_LINK, WEBSITE_LINK } from '../../config/links';

describe('config/links legal pages', () => {
  it('points Terms of Service at the live docs page', () => {
    expect(TERMS_OF_SERVICE_LINK).toBe('https://dehub.io/docs/terms-of-service');
  });

  it('points Privacy Policy at the live docs page', () => {
    expect(PRIVACY_POLICY_LINK).toBe('https://dehub.io/docs/privacy');
  });

  it('keeps both on the main site, never the retired docs host', () => {
    for (const link of [TERMS_OF_SERVICE_LINK, PRIVACY_POLICY_LINK]) {
      expect(link.startsWith(`${WEBSITE_LINK}/docs/`)).toBe(true);
      expect(link).not.toContain('dhb.gg');
    }
  });
});
