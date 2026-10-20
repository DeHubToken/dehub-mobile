import { isMaboroshiStudio, isMaboroshiDownload, maboroshiSessionScript, maboroshiPaymentResultScript, maboroshiStudioUrl } from '../../libs/maboroshi';

describe('Maboroshi session and downloads', () => {
  it('opens Remake in the same private studio and downloads its assembled edit', () => {
    expect(maboroshiStudioUrl(undefined, true)).toBe('https://live.dehub.io/maboroshi/?workflow=remake');
    expect(maboroshiStudioUrl('plushie-takeover', true)).toBe('https://live.dehub.io/maboroshi/?preset=plushie-takeover&workflow=remake');
    expect(isMaboroshiStudio(maboroshiStudioUrl(undefined, true))).toBe(true);
    const result = `https://live.dehub.io/maboroshi/media/${'a'.repeat(32)}/remake-result.mp4?expires=123456&signature=${'b'.repeat(64)}`;
    expect(isMaboroshiDownload(result)).toBe(true);
    expect(isMaboroshiDownload(result.replace('live.dehub.io', 'evil.test'))).toBe(false);
  });
  it('passes a preset without widening the trusted studio origin', () => {
    expect(maboroshiStudioUrl('plushie-takeover')).toBe('https://live.dehub.io/maboroshi/?preset=plushie-takeover');
    expect(isMaboroshiStudio(maboroshiStudioUrl('plushie-takeover'))).toBe(true);
    expect(maboroshiStudioUrl('https://evil.test/')).toBe('https://live.dehub.io/maboroshi/');
    expect(maboroshiStudioUrl('')).toBe('https://live.dehub.io/maboroshi/');
  });
  it('only delivers credentials to the exact hosted studio', () => {
    expect(isMaboroshiStudio('https://live.dehub.io/maboroshi/')).toBe(true);
    for (const url of ['https://live.dehub.io.evil.test/maboroshi/', 'https://evil.test/', 'https://live.dehub.io/maboroshi/setup', 'http://live.dehub.io/maboroshi/', 'https://user:pass@live.dehub.io/maboroshi/']) {
      expect(isMaboroshiStudio(url)).toBe(false);
    }
    expect(maboroshiSessionScript('</script>', 'wallet', false)).not.toContain('</script>');
    expect(maboroshiSessionScript('token', 'wallet', false)).toContain('"allowPayments":false');
    expect(maboroshiSessionScript('token', 'wallet', false)).toContain('"paymentBridge":1');
    expect(maboroshiPaymentResultScript('request', '</script>')).not.toContain('</script>');
    expect(maboroshiPaymentResultScript('request', 'Payment cancelled.', true)).toContain('"cancelled":true');
    expect(maboroshiPaymentResultScript('request', 'Payment could not be confirmed.')).toContain('"cancelled":false');
  });
  it('restricts native file downloads to signed Maboroshi video paths', () => {
    const url = `https://live.dehub.io/maboroshi/media/${'a'.repeat(32)}/hd/final-preview.mp4?expires=123456&signature=${'b'.repeat(64)}`;
    expect(isMaboroshiDownload(url)).toBe(true);
    expect(isMaboroshiDownload(url.replace('live.dehub.io', 'evil.test'))).toBe(false);
    expect(isMaboroshiDownload(url.replace('final-preview.mp4', 'provider-settings.json'))).toBe(false);
    expect(isMaboroshiDownload(url.split('?')[0])).toBe(false);
  });
});
