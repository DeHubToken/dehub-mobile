import { act, renderHook } from '@testing-library/react-native';
import type { LayoutChangeEvent } from 'react-native';

jest.mock('react-native-reanimated', () => ({
  useSharedValue: (value: unknown) => jest.requireActual('react').useRef({ value }).current,
  useAnimatedStyle: (fn: () => unknown) => fn(),
  useAnimatedScrollHandler: (handlers: unknown) => handlers,
  withTiming: (value: number) => value,
  cancelAnimation: jest.fn(),
  Easing: { bezier: () => undefined },
}));
import { useCollapsibleHeader } from '../../hooks/useCollapsibleHeader';

describe('collapsible header scroll recovery', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(10000));
  afterEach(() => jest.restoreAllMocks());
  it.each(['js', 'worklet'])('keeps scrolling out of React renders (%s)', path => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useCollapsibleHeader();
    });
    act(() => result.current.onHeaderLayout({ nativeEvent: { layout: { height: 100 } } } as LayoutChangeEvent));
    const beforeScroll = renders;
    const drive = (y: number) => path === 'js'
      ? result.current.handleScrollOffset(y, 0)
      : (result.current.scrollHandler as unknown as { onScroll: (event: { contentOffset: { y: number } }) => void }).onScroll({ contentOffset: { y } });
    act(() => { for (let y = 20; y <= 600; y += 20) drive(y); });
    expect(result.current.translateY.value).toBe(-100);
    expect(renders).toBe(beforeScroll);
    act(() => { for (let y = 580; y >= 0; y -= 20) drive(y); });
    expect(result.current.translateY.value).toBe(0);
    expect(renders).toBe(beforeScroll);
  });
  it.each(['js', 'worklet'])('restores the header after a large jump to the top (%s)', path => {
    const { result } = renderHook(() => useCollapsibleHeader());
    act(() => result.current.onHeaderLayout({ nativeEvent: { layout: { height: 100 } } } as LayoutChangeEvent));
    const drive = (y: number) => path === 'js'
      ? result.current.handleScrollOffset(y, 0)
      : (result.current.scrollHandler as unknown as { onScroll: (event: { contentOffset: { y: number } }) => void }).onScroll({ contentOffset: { y } });
    act(() => { for (let y = 20; y <= 600; y += 20) drive(y); });
    expect(result.current.translateY.value).toBe(-100);
    act(() => drive(0));
    expect(result.current.translateY.value).toBe(0);
    expect(result.current.scrollOffset.value).toBe(0);
  });
});
