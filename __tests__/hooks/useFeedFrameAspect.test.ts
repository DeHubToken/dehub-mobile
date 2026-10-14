import { renderHook } from '@testing-library/react-native';
import { useFeedFrameAspect } from '../../hooks/useFeedFrameAspect';

describe('feed frame stability', () => {
  it('prepares offscreen but keeps the visible poster, player and recycled return the same size', () => {
    const view = renderHook(({ ratio, visible }) => useFeedFrameAspect('stable-native-video', ratio, visible), {
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
    const view = renderHook(({ key, ratio, enabled }) => useFeedFrameAspect(key, ratio, true, enabled), {
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
