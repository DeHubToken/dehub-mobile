import { act, renderHook } from '@testing-library/react-native';
import { useSheetClosed } from '../../hooks/useSheetClosed';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('releases a dismissed modal when its animation never completes', () => {
  const { result, rerender } = renderHook(({ visible }) => useSheetClosed(visible), {
    initialProps: { visible: true },
  });
  rerender({ visible: false });
  expect(result.current[0]).toBe(false);
  act(() => jest.advanceTimersByTime(500));
  expect(result.current[0]).toBe(true);
});

it('ignores a stale close callback and timeout after reopening', () => {
  const { result, rerender } = renderHook(({ visible }) => useSheetClosed(visible), {
    initialProps: { visible: true },
  });
  rerender({ visible: false });
  const staleFinish = result.current[1];
  act(() => jest.advanceTimersByTime(200));
  rerender({ visible: true });
  act(() => { staleFinish(true); jest.advanceTimersByTime(600); });
  expect(result.current[0]).toBe(false);
});

it('allows a completed exit to release before the deadline', () => {
  const { result, rerender, unmount } = renderHook(({ visible }) => useSheetClosed(visible), {
    initialProps: { visible: true },
  });
  rerender({ visible: false });
  act(() => result.current[1](true));
  expect(result.current[0]).toBe(true);
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});
