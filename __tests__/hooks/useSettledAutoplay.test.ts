import { act, renderHook } from '@testing-library/react-native';
import { useSettledAutoplay } from '../../hooks/useSettledAutoplay';
import { __resetScrollActivityForTests, setFeedScrolling } from '../../libs/scrollActivity';

describe('autoplay resource dwell', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetScrollActivityForTests();
  });
  afterEach(() => {
    __resetScrollActivityForTests();
    jest.useRealTimers();
  });

  it('waits for the feed to stop even when the same candidate stays visible', () => {
    setFeedScrolling(true);
    const { result } = renderHook(() => useSettledAutoplay(true, 'a', 400, true));
    act(() => jest.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
    act(() => setFeedScrolling(false));
    act(() => jest.advanceTimersByTime(399));
    expect(result.current).toBe(false);
    act(() => jest.advanceTimersByTime(1));
    expect(result.current).toBe(true);
  });

  it('cancels a pending start when scrolling begins without rendering the row', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useSettledAutoplay(true, 'a', 400, true);
    });
    const initialRenders = renders;
    act(() => jest.advanceTimersByTime(200));
    act(() => setFeedScrolling(true));
    act(() => jest.advanceTimersByTime(600));
    expect(result.current).toBe(false);
    expect(renders).toBe(initialRenders);
    act(() => setFeedScrolling(false));
    act(() => jest.advanceTimersByTime(400));
    expect(result.current).toBe(true);
  });

  it('keeps an allocated player settled while scrolling and removes subscriptions on unmount', () => {
    const { result, unmount } = renderHook(() => useSettledAutoplay(true, 'a', 400, true));
    act(() => jest.advanceTimersByTime(400));
    expect(result.current).toBe(true);
    act(() => setFeedScrolling(true));
    expect(result.current).toBe(true);
    act(() => setFeedScrolling(false));
    expect(jest.getTimerCount()).toBe(0);
    unmount();
    act(() => setFeedScrolling(true));
    act(() => setFeedScrolling(false));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('never allocates for candidates passed during a fling', () => {
    const { result, rerender } = renderHook<boolean, { eligible: boolean; key: string }>(
      ({ eligible, key }) => useSettledAutoplay(eligible, key, 400),
      { initialProps: { eligible: true, key: 'a' } },
    );
    act(() => jest.advanceTimersByTime(200));
    expect(result.current).toBe(false);
    rerender({ eligible: true, key: 'b' });
    act(() => jest.advanceTimersByTime(200));
    expect(result.current).toBe(false);
    rerender({ eligible: false, key: 'b' });
    act(() => jest.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
  });

  it('allows a settled candidate and resets when it leaves or is replaced', () => {
    const { result, rerender } = renderHook<boolean, { eligible: boolean; key: string }>(
      ({ eligible, key }) => useSettledAutoplay(eligible, key, 400),
      { initialProps: { eligible: true, key: 'a' } },
    );
    act(() => jest.advanceTimersByTime(400));
    expect(result.current).toBe(true);
    rerender({ eligible: true, key: 'b' });
    expect(result.current).toBe(false);
    act(() => jest.advanceTimersByTime(400));
    expect(result.current).toBe(true);
    rerender({ eligible: false, key: 'b' });
    expect(result.current).toBe(false);
    rerender({ eligible: true, key: 'b' });
    expect(result.current).toBe(false);
    act(() => jest.advanceTimersByTime(400));
    expect(result.current).toBe(true);
  });

  it('cancels pending allocation on unmount and ignores absent sources', () => {
    const { unmount } = renderHook(() => useSettledAutoplay(true, 'a', 400));
    expect(jest.getTimerCount()).toBe(1);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
    const { result } = renderHook(() => useSettledAutoplay(true, undefined, 400));
    act(() => jest.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });
});
