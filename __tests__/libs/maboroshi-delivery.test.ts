jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: async (_algorithm: string, key: string) => require('crypto').createHash('sha256').update(key).digest('hex') }));
import { isMaboroshiDelivery, maboroshiAssetId } from '../../libs/maboroshi-delivery';

const projectId = 'a'.repeat(32);
const input = { type: 'maboroshi:save' as const, requestId: 'request-1', wallet: `0x${'1'.repeat(40)}`, projectId,
  url: `https://live.dehub.io/maboroshi/media/${projectId}/remake-result.mp4?expires=123456&signature=${'b'.repeat(64)}`,
  version: 'c'.repeat(32), createdAt: 1000 };

describe('private Remake delivery', () => {
  it('accepts only owned project result paths with signed media links', () => {
    expect(isMaboroshiDelivery(input)).toBe(true);
    for (const update of [ { url: input.url.replace('live.dehub.io', 'evil.test') },
      { url: input.url.replace('remake-result.mp4', 'upload.mp4') }, { projectId: 'd'.repeat(32) },
      { url: input.url.split('?')[0] }, { wallet: '' }, { createdAt: NaN }, { version: '<script>' } ]) {
      expect(isMaboroshiDelivery({ ...input, ...update })).toBe(false);
    }
  });
  it('deduplicates renewed signed links while retaining separately assembled revisions', async () => {
    const id = await maboroshiAssetId(input);
    expect(id).toMatch(/^remake-[a-f0-9]{48}$/);
    expect(await maboroshiAssetId({ ...input, url: input.url.replace('expires=123456', 'expires=654321') })).toBe(id);
    expect(await maboroshiAssetId({ ...input, version: 'd'.repeat(32) })).not.toBe(id);
    expect(await maboroshiAssetId({ ...input, url: input.url.replace('remake-result.mp4', 'hd/final-preview.mp4') })).not.toBe(id);
  });
});
