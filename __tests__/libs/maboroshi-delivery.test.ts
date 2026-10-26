jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: async (_algorithm: string, key: string) => require('crypto').createHash('sha256').update(key).digest('hex') }));
import { isMaboroshiDelivery, maboroshiAssetId, maboroshiAspect } from '../../libs/maboroshi-delivery';

const projectId = 'a'.repeat(32);
const input = { type: 'maboroshi:save' as const, requestId: 'request-1', wallet: `0x${'1'.repeat(40)}`, projectId,
  url: `https://live.dehub.io/maboroshi/media/${projectId}/remake-result.mp4?expires=123456&signature=${'b'.repeat(64)}`,
  version: 'c'.repeat(32), createdAt: 1000, width: 1080, height: 1920 };

describe('private Remake delivery', () => {
  it('accepts only owned project result paths with signed media links', () => {
    expect(isMaboroshiDelivery(input)).toBe(true);
    for (const update of [ { url: input.url.replace('live.dehub.io', 'evil.test') },
      { url: input.url.replace('remake-result.mp4', 'upload.mp4') }, { projectId: 'd'.repeat(32) },
      { url: input.url.split('?')[0] }, { wallet: '' }, { createdAt: NaN }, { version: '<script>' }, { width: 0 }, { height: Infinity } ]) {
      expect(isMaboroshiDelivery({ ...input, ...update })).toBe(false);
    }
  });
  it('retains portrait and square output aspect instead of assuming landscape', () => {
    expect(maboroshiAspect(input)).toBe('9:16');
    expect(maboroshiAspect({ width: 1080, height: 1080 })).toBe('1:1');
    expect(maboroshiAspect({ width: 1920, height: 1080 })).toBe('16:9');
  });
  it('deduplicates renewed signed links while retaining separately assembled revisions', async () => {
    const id = await maboroshiAssetId(input);
    expect(id).toMatch(/^remake-[a-f0-9]{48}$/);
    expect(await maboroshiAssetId({ ...input, url: input.url.replace('expires=123456', 'expires=654321') })).toBe(id);
    expect(await maboroshiAssetId({ ...input, version: 'd'.repeat(32) })).not.toBe(id);
    expect(await maboroshiAssetId({ ...input, url: input.url.replace('remake-result.mp4', 'hd/final-preview.mp4') })).not.toBe(id);
  });
});
