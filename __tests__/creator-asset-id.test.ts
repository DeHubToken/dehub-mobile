import { creatorAssetId } from '../libs/creatorAssetId';

describe('native Creator library identity', () => {
  it('assigns distinct assets to batch results while keeping retries and reloads stable', () => {
    const first = creatorAssetId('request', 'image-1', 'image', 'results-v1');
    const second = creatorAssetId('request', 'image-2', 'image', 'results-v1');
    expect(first).not.toBe(second);
    expect(creatorAssetId('request', 'image-1', 'image', 'results-v1')).toBe(first);
  });
  it('preserves legacy single-result identities even when a result message already has an id', () => {
    expect(creatorAssetId('old-request', 'old-result', 'video')).toBe('native-old-request-video');
    expect(creatorAssetId('old-request', undefined, 'image')).toBe('native-old-request-image');
  });
});
