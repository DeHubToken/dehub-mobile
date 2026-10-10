import { isMaboroshiStudio, isMaboroshiDownload, maboroshiSessionScript } from '../../libs/maboroshi';

describe('Maboroshi session and downloads', () => {
  it('only delivers credentials to the exact hosted studio', () => {
    expect(isMaboroshiStudio('https://live.dehub.io/maboroshi/')).toBe(true);
    for (const url of ['https://live.dehub.io.evil.test/maboroshi/', 'https://evil.test/', 'https://live.dehub.io/maboroshi/setup', 'http://live.dehub.io/maboroshi/', 'https://user:pass@live.dehub.io/maboroshi/']) {
      expect(isMaboroshiStudio(url)).toBe(false);
    }
    expect(maboroshiSessionScript('</script>', 'wallet', false)).not.toContain('</script>');
    expect(maboroshiSessionScript('token', 'wallet', false)).toContain('"allowPayments":false');
  });
  it('restricts native file downloads to signed Maboroshi video paths', () => {
    const url = `https://live.dehub.io/maboroshi/media/${'a'.repeat(32)}/hd/final-preview.mp4?expires=123456&signature=${'b'.repeat(64)}`;
    expect(isMaboroshiDownload(url)).toBe(true);
    expect(isMaboroshiDownload(url.replace('live.dehub.io', 'evil.test'))).toBe(false);
    expect(isMaboroshiDownload(url.replace('final-preview.mp4', 'provider-settings.json'))).toBe(false);
    expect(isMaboroshiDownload(url.split('?')[0])).toBe(false);
  });
});
