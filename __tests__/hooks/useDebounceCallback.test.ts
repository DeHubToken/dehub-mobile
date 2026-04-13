import { renderHook, act } from '@testing-library/react-native';
import { useDebounceCallback } from '../../hooks/useDebounceCallback';

describe('hooks/useDebounceCallback', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('calls function after delay', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebounceCallback(fn, 300));

    act(() => {
      result.current('hello');
    });

    expect(fn).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(fn).toHaveBeenCalledWith('hello');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets timer on rapid calls, only fires last', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebounceCallback(fn, 200));

    act(() => {
      result.current('a');
      result.current('b');
      result.current('c');
    });

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('uses default 400ms delay', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebounceCallback(fn));

    act(() => {
      result.current();
    });

    act(() => {
      jest.advanceTimersByTime(399);
    });
    expect(fn).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fires separately for calls spaced beyond delay', () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useDebounceCallback(fn, 100));

    act(() => {
      result.current('first');
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(fn).toHaveBeenCalledWith('first');

    act(() => {
      result.current('second');
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('second');
  });
});
