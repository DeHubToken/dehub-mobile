import { act, renderHook } from '@testing-library/react-native';
import { useSettledAutoplay } from '../../hooks/useSettledAutoplay';

describe('autoplay resource dwell', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('never allocates for candidates passed during a fling', () => {
    const { result, rerender } = renderHook(
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
    const { result, rerender } = renderHook(
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
