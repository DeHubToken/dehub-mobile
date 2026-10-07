import { createMediaAspectCache } from '../../libs/media-aspect-cache';

describe('persistent media dimensions', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
  it('restores dimensions before the bitmap loads, and batches bounded writes', () => {
    const write = jest.fn();
    const cache = createMediaAspectCache(() => '[["photo",1.5],["invalid",-1]]', write);
    expect(cache.get('photo')).toBe(1.5);
    expect(cache.get('invalid')).toBeUndefined();
    for (let n = 0; n < 300; n++) cache.set(`photo-${n}`, 2);
    expect(write).not.toHaveBeenCalled();
    jest.advanceTimersByTime(500);
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(write.mock.calls[0][0])).toHaveLength(250);
  });
  it('keeps working when storage is corrupt or unavailable', () => {
    const cache = createMediaAspectCache(() => '{', () => { throw new Error('quota'); });
    cache.set('photo', 0.5);
    cache.set('bad', NaN);
    jest.advanceTimersByTime(500);
    expect(cache.get('photo')).toBe(0.5);
    expect(cache.get('bad')).toBeUndefined();
  });
});
