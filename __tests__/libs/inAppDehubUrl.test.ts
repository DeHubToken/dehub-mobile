import { inAppDehubUrl } from '../../libs/links.utils';

describe('inAppDehubUrl', () => {
  it('keeps governance links in the app', () => {
    expect(inAppDehubUrl('https://dehub.io/app/governance/1b0c6c1e-6f4a-4a39-9d1e-0b6d2b1f3c11'))
      .toBe('dehub://app/governance/1b0c6c1e-6f4a-4a39-9d1e-0b6d2b1f3c11');
    expect(inAppDehubUrl('https://dehub.io/app/governance')).toBe('dehub://app/governance');
  });

  it('keeps other /app pages in the app, query and all', () => {
    expect(inAppDehubUrl('https://dehub.io/app/features?request=7')).toBe('dehub://app/features?request=7');
  });

  it('leaves other sites and non-app pages to the browser', () => {
    expect(inAppDehubUrl('https://example.com/app/governance')).toBeNull();
    expect(inAppDehubUrl('https://dehub.io/docs')).toBeNull();
    expect(inAppDehubUrl('https://dehub.io/apps/dev')).toBeNull();
  });
});
