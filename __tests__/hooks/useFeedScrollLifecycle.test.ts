import { act, renderHook } from '@testing-library/react-native';
import { useFeedScrollLifecycle } from '../../hooks/useFeedScrollLifecycle';
import { __resetScrollActivityForTests, isFeedScrolling } from '../../libs/scrollActivity';

beforeEach(() => { jest.useFakeTimers(); __resetScrollActivityForTests(); });
afterEach(() => { __resetScrollActivityForTests(); jest.useRealTimers(); });

it('keeps capture and autoplay paused through the lift-to-fling handoff', () => {
  const begin = jest.fn();
  const settled = jest.fn();
  const { result } = renderHook(() => useFeedScrollLifecycle(begin, settled));
  act(() => result.current.begin());
  act(() => result.current.endDrag());
  act(() => jest.advanceTimersByTime(32));
  act(() => result.current.begin());
  act(() => jest.advanceTimersByTime(500));
  expect(isFeedScrolling()).toBe(true);
  expect(begin).toHaveBeenCalledTimes(1);
  expect(settled).not.toHaveBeenCalled();
  act(() => result.current.settle());
  expect(isFeedScrolling()).toBe(false);
  expect(settled).toHaveBeenCalledTimes(1);
});

it('settles a drag without momentum once, and cancels work on unmount', () => {
  const settled = jest.fn();
  const { result, unmount } = renderHook(() => useFeedScrollLifecycle(jest.fn(), settled));
  act(() => result.current.begin());
  act(() => result.current.endDrag());
  act(() => jest.advanceTimersByTime(119));
  expect(isFeedScrolling()).toBe(true);
  act(() => jest.advanceTimersByTime(1));
  act(() => result.current.settle());
  expect(settled).toHaveBeenCalledTimes(1);
  act(() => result.current.begin());
  act(() => result.current.endDrag());
  unmount();
  expect(isFeedScrolling()).toBe(false);
  act(() => jest.advanceTimersByTime(200));
  expect(settled).toHaveBeenCalledTimes(1);
});
