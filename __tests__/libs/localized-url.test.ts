import { withDeHubLanguage } from '../../libs/localized-url';

describe('DeHub language handoff', () => {
  it('keeps anchors and query state while selecting the app language', () => {
    expect(withDeHubLanguage('https://dehub.io/docs/dapps?view=all#badges', 'tr'))
      .toBe('https://dehub.io/docs/dapps?view=all&hl=tr#badges');
  });
  it('preserves an explicitly selected language and leaves external sites alone', () => {
    expect(withDeHubLanguage('https://dehub.io/docs?hl=ar', 'es')).toBe('https://dehub.io/docs?hl=ar');
    expect(withDeHubLanguage('https://example.com/docs', 'es')).toBe('https://example.com/docs');
  });
  it('uses production for retired staging links', () => {
    expect(withDeHubLanguage('https://staging.dehub.io/docs', 'fr')).toBe('https://dehub.io/docs?hl=fr');
  });
});
