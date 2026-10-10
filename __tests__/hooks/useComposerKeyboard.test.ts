import { act, renderHook } from '@testing-library/react-native';
import { Keyboard, Platform } from 'react-native';
import { useComposerKeyboard } from '../../hooks/useComposerKeyboard';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Keyboard: { addListener: jest.fn() },
  useWindowDimensions: () => ({ width: 360, height: 800 }),
  StyleSheet: { flatten: (style: any) => style },
}));

describe('live composer keyboard geometry', () => {
  const listeners: Record<string, (event?: any) => void> = {};
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => {
      listeners[name] = listener;
      return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('responds to parent resize even when window dimensions do not change, then restores on dismiss', () => {
    const { result, rerender } = renderHook<ReturnType<typeof useComposerKeyboard>, { height: number }>(({ height }) => useComposerKeyboard(height), {
      initialProps: { height: 800 },
    });
    let bottom = 774;
    (result.current.ref as any).current = {
      measureInWindow: (done: any) => done(0, bottom - 48, 360, 48),
    };
    act(() => listeners.keyboardDidShow({ endCoordinates: { screenY: 500 } }));
    expect(result.current.lift).toBe(282);

    // Native adjustResize lands after the initial keyboard event.
    bottom = 192;
    rerender({ height: 500 });
    expect(result.current.lift).toBe(-18);

    bottom = 492;
    act(() => result.current.onLayout());
    expect(result.current.lift).toBe(-18);
    act(() => listeners.keyboardDidHide());
    expect(result.current.lift).toBe(0);
  });

  it('ignores a measurement returning after keyboard dismissal', () => {
    const { result } = renderHook(() => useComposerKeyboard(800));
    let finish: any;
    (result.current.ref as any).current = { measureInWindow: (done: any) => { finish = done; } };
    act(() => listeners.keyboardDidShow({ endCoordinates: { screenY: 500 } }));
    act(() => listeners.keyboardDidHide());
    act(() => finish(0, 726, 360, 48));
    expect(result.current.lift).toBe(0);
  });
});

describe('docked composer keyboard geometry', () => {
  let listeners: Record<string, (event?: any) => void> = {};
  beforeEach(() => {
    listeners = {};
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => {
      listeners[name] = listener;
      return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
    });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('sits flush on the keys from a resting offset, and re-measures once the window settles', () => {
    const { result } = renderHook(() => useComposerKeyboard(0, { gap: 0, restingOffset: 80 }));
    // Resting: 80pt tab-bar margin, composer bottom at 720.
    let bottom = 720;
    (result.current.ref as any).current = {
      measureInWindow: (done: any) => done(0, bottom - 60, 360, 60),
    };
    act(() => listeners.keyboardDidShow({ endCoordinates: { screenY: 480, height: 300 } }));
    expect(result.current.isVisible).toBe(true);
    // Margin drops to the lift: composer bottom = 800 - 320 = 480.
    expect(result.current.lift).toBe(320);

    // A late window resize, with no keyboard event, leaves it floating 24pt up.
    bottom = 456;
    act(() => { jest.advanceTimersByTime(400); });
    expect(result.current.lift).toBe(296);

    act(() => listeners.keyboardDidHide());
    expect(result.current).toMatchObject({ lift: 0, isVisible: false });
  });

  it('falls back to the keyboard height when the composer cannot be measured', () => {
    const { result } = renderHook(() => useComposerKeyboard(0, { gap: 0 }));
    act(() => listeners.keyboardDidShow({ endCoordinates: { screenY: 480, height: 300 } }));
    expect(result.current.lift).toBe(300);
  });

  it('stays down when disabled', () => {
    const { result } = renderHook(() => useComposerKeyboard(0, { enabled: false }));
    expect(listeners.keyboardDidShow).toBeUndefined();
    expect(result.current.lift).toBe(0);
  });
});
