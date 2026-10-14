import { act, renderHook } from '@testing-library/react-native';
import { useSettledPagerIndex } from '../../hooks/useSettledPagerIndex';

describe('shorts landing after interrupted momentum', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('commits the landing offset when Android omits momentum-end', () => {
    const commit = jest.fn();
    const { result } = renderHook(() => useSettledPagerIndex(commit, 800, 5));
    act(() => { result.current.begin(); result.current.endDrag(300); result.current.begin(); });
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
});
