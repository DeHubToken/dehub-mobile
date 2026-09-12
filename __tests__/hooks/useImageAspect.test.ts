import { act, renderHook } from '@testing-library/react-native';
import { Image } from 'react-native';
import type { ImageLoadEventData } from 'expo-image';
import { useImageAspect } from '../../hooks/useImageAspect';
import { FEED_IMAGE_FALLBACK_ASPECT } from '../../libs/feed-image-layout';

const loaded = (width: number, height: number): ImageLoadEventData => ({
  cacheType: 'disk',
  source: { url: '', width, height, mediaType: 'image' },
});

describe('useImageAspect', () => {
  it('uses the displayed image dimensions without a separate native fetch', () => {
    const getSize = jest.spyOn(Image, 'getSize');
    const { result } = renderHook(() => useImageAspect('single-load'));
    expect(result.current.ratio).toBe(FEED_IMAGE_FALLBACK_ASPECT);
    act(() => result.current.onLoad(loaded(1200, 800)));
    expect(result.current.ratio).toBe(1.5);
    expect(getSize).not.toHaveBeenCalled();
    getSize.mockRestore();
  });

  it('restores cached dimensions when a feed row remounts', () => {
    const first = renderHook(() => useImageAspect('cached-photo'));
    act(() => first.result.current.onLoad(loaded(600, 1200)));
    first.unmount();
    const second = renderHook(() => useImageAspect('cached-photo'));
    expect(second.result.current.ratio).toBe(0.5);
  });

  it('ignores an old request for a recycled row and resets its layout immediately', () => {
    const { result, rerender } = renderHook<ReturnType<typeof useImageAspect>, { uri: string }>(({ uri }) => useImageAspect(uri), {
      initialProps: { uri: 'old-photo' },
    });
    const oldLoad = result.current.onLoad;
    act(() => oldLoad(loaded(200, 100)));
    rerender({ uri: 'replacement-photo' });
    expect(result.current.ratio).toBe(FEED_IMAGE_FALLBACK_ASPECT);
    act(() => oldLoad(loaded(300, 100)));
    expect(result.current.ratio).toBe(FEED_IMAGE_FALLBACK_ASPECT);
    act(() => result.current.onLoad(loaded(100, 400)));
    expect(result.current.ratio).toBe(0.25);
  });

  it('keeps a usable layout when dimensions are invalid', () => {
    const { result } = renderHook(() => useImageAspect('invalid-photo'));
    for (const [width, height] of [[0, 10], [10, 0], [-1, 10], [Infinity, 10], [10, NaN]]) {
      act(() => result.current.onLoad(loaded(width, height)));
      expect(result.current.ratio).toBe(FEED_IMAGE_FALLBACK_ASPECT);
    }
  });
});
