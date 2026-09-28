import { act, renderHook } from '@testing-library/react-native';
import { useSettledPagerIndex } from '../../hooks/useSettledPagerIndex';

describe('settled pager player selection', () => {
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
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(3);
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
});
