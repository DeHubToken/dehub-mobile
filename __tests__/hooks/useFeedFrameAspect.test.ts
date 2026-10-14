import { act, renderHook } from '@testing-library/react-native';
import { useFeedFrameAspect } from '../../hooks/useFeedFrameAspect';
import { setFeedScrolling, __resetScrollActivityForTests } from '../../libs/scrollActivity';

afterEach(__resetScrollActivityForTests);

describe('feed frame stability', () => {
  it('corrects a visible video fallback after dimensions arrive and the fling settles', () => {
    const view = renderHook<number, { measured: number | null }>(({ measured }) =>
      useFeedFrameAspect('resolved-native-portrait', measured ?? 16 / 9, true, true, measured), {
      initialProps: { measured: null },
    });
    expect(view.result.current).toBe(16 / 9);
    act(() => setFeedScrolling(true));
    view.rerender({ measured: 9 / 16 });
    expect(view.result.current).toBe(16 / 9);
    act(() => setFeedScrolling(false));
    expect(view.result.current).toBe(9 / 16);
    view.unmount();
    const recycled = renderHook(() => useFeedFrameAspect('resolved-native-portrait', 16 / 9, true));
    expect(recycled.result.current).toBe(9 / 16);
  });

  it('holds a partially entering row before it reaches playback viewability', () => {
    const view = renderHook<number, { ratio: number }>(({ ratio }) => useFeedFrameAspect('entering-native-video', ratio, false), {
      initialProps: { ratio: 16 / 9 },
    });
    view.rerender({ ratio: 0.75 });
    act(() => setFeedScrolling(true));
    view.rerender({ ratio: 0.5 });
    expect(view.result.current).toBe(0.75);
    act(() => setFeedScrolling(false));
    view.rerender({ ratio: 1 });
    expect(view.result.current).toBe(0.75);
  });

  it('holds a new recycled row mounted during a fling', () => {
    act(() => setFeedScrolling(true));
    const view = renderHook<number, { ratio: number }>(({ ratio }) => useFeedFrameAspect('fling-mounted-video', ratio, false), {
      initialProps: { ratio: 16 / 9 },
    });
    view.rerender({ ratio: 0.5 });
    expect(view.result.current).toBe(16 / 9);
  });
  it('prepares offscreen but keeps the visible poster, player and recycled return the same size', () => {
    const view = renderHook<number, { ratio: number; visible: boolean }>(({ ratio, visible }) => useFeedFrameAspect('stable-native-video', ratio, visible), {
      initialProps: { ratio: 16 / 9, visible: false },
    });
    view.rerender({ ratio: 9 / 16, visible: false });
    expect(view.result.current).toBe(9 / 16);
    view.rerender({ ratio: 9 / 16, visible: true });
    view.rerender({ ratio: 1, visible: true });
    expect(view.result.current).toBe(9 / 16);
    view.unmount();
    const player = renderHook(() => useFeedFrameAspect('stable-native-video', 1, true));
    expect(player.result.current).toBe(9 / 16);
  });

  it('reserves a cold image without growing on load, and resets for another post', () => {
    const view = renderHook<number, { key: string; ratio: number; enabled: boolean }>(({ key, ratio, enabled }) => useFeedFrameAspect(key, ratio, true, enabled), {
      initialProps: { key: 'native-image-a', ratio: 4 / 3, enabled: true },
    });
    view.rerender({ key: 'native-image-a', ratio: 0.5, enabled: true });
    expect(view.result.current).toBe(4 / 3);
    view.rerender({ key: 'native-image-b', ratio: 2, enabled: true });
    expect(view.result.current).toBe(2);
    view.rerender({ key: 'native-image-a', ratio: 0.5, enabled: false });
    expect(view.result.current).toBe(0.5);
  });
});
