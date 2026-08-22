import { act, renderHook } from '@testing-library/react-native';

import { useDebouncedValue } from '../../hooks/useDebouncedValue';

describe('hooks/useDebouncedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the initial value straight away', () => {
    const { result } = renderHook(() => useDebouncedValue('lofi', 300));
    expect(result.current).toBe('lofi');
  });

  it('holds a change back until the delay has passed', () => {
    const { result, rerender } = renderHook<string, { v: string }>(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: 'lo' },
    });

    rerender({ v: 'lofi' });
    expect(result.current).toBe('lo');

    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(result.current).toBe('lo');

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe('lofi');
  });

  it('only emits the last value of a burst — one query per pause, not per keystroke', () => {
    const { result, rerender } = renderHook<string, { v: string }>(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: '' },
    });

    for (const v of ['l', 'lo', 'lof', 'lofi']) {
      rerender({ v });
      act(() => {
        jest.advanceTimersByTime(100);
      });
    }
    expect(result.current).toBe('');

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current).toBe('lofi');
  });
});
