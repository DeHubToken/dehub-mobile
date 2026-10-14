import { act, renderHook } from '@testing-library/react-native';
import { useSettledPagerIndex } from '../../hooks/useSettledPagerIndex';

describe('shorts landing after interrupted momentum', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('ignores passing candidates until momentum lands on the final page', () => {
    const commit = jest.fn();
    const { result } = renderHook(() => useSettledPagerIndex(commit, 800, 10));
    act(() => result.current.candidate(0));
    commit.mockClear();
    act(() => {
      result.current.begin();
      result.current.candidate(1);
      result.current.endDrag(900);
      result.current.begin();
      result.current.candidate(2);
      jest.advanceTimersByTime(1000);
    });
    expect(commit).not.toHaveBeenCalled();
    act(() => result.current.settle(2400));
    expect(commit.mock.calls).toEqual([[3]]);
  });

  it('handles a release without momentum and cancels it on another drag', () => {
    const commit = jest.fn();
    const { result } = renderHook(() => useSettledPagerIndex(commit, 800, 10));
    act(() => { result.current.begin(); result.current.endDrag(800); });
    act(() => jest.advanceTimersByTime(160));
    expect(commit).toHaveBeenLastCalledWith(1);
    commit.mockClear();
    act(() => { result.current.begin(); result.current.endDrag(1600); result.current.begin(); });
    act(() => jest.advanceTimersByTime(1000));
    expect(commit).not.toHaveBeenCalled();
  });

  it('uses current dimensions and item count, clamps the footer, and cleans up', () => {
    const commit = jest.fn();
    const { result, rerender, unmount } = renderHook(
      ({ height, count }: { height: number; count: number }) => useSettledPagerIndex(commit, height, count),
      { initialProps: { height: 800, count: 2 } },
    );
    rerender({ height: 600, count: 4 });
    act(() => result.current.settle(5000));
    expect(commit).toHaveBeenLastCalledWith(3);
    act(() => result.current.settle(-300));
    expect(commit).toHaveBeenLastCalledWith(0);
    act(() => { result.current.begin(); result.current.endDrag(600); });
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('commits the landing offset when Android omits momentum-end', () => {
    const commit = jest.fn();
    const { result } = renderHook(() => useSettledPagerIndex(commit, 800, 5));
    act(() => { result.current.begin(); result.current.endDrag(300); result.current.momentum(); });
    act(() => { result.current.observe(600); jest.advanceTimersByTime(100); result.current.observe(800); });
    expect(commit).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(160));
    expect(commit).toHaveBeenCalledWith(1);
  });

  it('keeps passing pages inactive and cancels the fallback on a native landing', () => {
    const commit = jest.fn();
    const { result } = renderHook(() => useSettledPagerIndex(commit, 800, 5));
    act(() => { result.current.begin(); result.current.observe(800); result.current.candidate(1); });
    expect(commit).not.toHaveBeenCalled();
    act(() => { result.current.settle(1600); jest.advanceTimersByTime(200); });
    expect(commit.mock.calls).toEqual([[2]]);
  });

  it('never starts a passing player while the finger holds the pager', () => {
    const commit = jest.fn();
    const { result } = renderHook(() => useSettledPagerIndex(commit, 800, 5));
    act(() => { result.current.begin(); result.current.observe(600); jest.advanceTimersByTime(1000); });
    expect(commit).not.toHaveBeenCalled();
    act(() => { result.current.endDrag(800); jest.advanceTimersByTime(160); });
    expect(commit).toHaveBeenCalledWith(1);
  });
});
