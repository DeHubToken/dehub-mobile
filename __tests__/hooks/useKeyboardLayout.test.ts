/**
 * The keyboard height each platform reports is measured from a different edge,
 * and a composer lifted by the wrong amount either floats above the keys or
 * hides behind them.
 *
 * iOS reports the keyboard down to the physical bottom of the screen, so the
 * home-indicator band the root SafeAreaView already spent has to come off.
 * Android (React Native's `ReactRootView.checkForKeyboardEvents`) reports
 * `ime - systemBars`, the keyboard above the navigation bar, so nothing comes
 * off — taking the bar out twice left the input row behind the keyboard on
 * every phone with a three-button bar.
 */

import { Platform } from 'react-native';
import { renderHook } from '@testing-library/react-native';

const mockKeyboard = { height: 0, isVisible: false };
const mockInsets = { top: 47, bottom: 34, left: 0, right: 0 };

jest.mock('../../hooks/useKeyboard', () => ({
  useKeyboard: () => mockKeyboard,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
}));

import { useKeyboardLift, useKeyboardOffset } from '../../hooks/useKeyboardLayout';

describe('useKeyboardLift', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockKeyboard.height = 0;
    mockKeyboard.isVisible = false;
  });

  it('lifts by the reported height minus the home indicator on iOS', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockKeyboard.height = 336;
    mockKeyboard.isVisible = true;
    mockInsets.bottom = 34;

    const { result } = renderHook(() => useKeyboardLift());

    expect(result.current.lift).toBe(302);
    expect(result.current.rawHeight).toBe(336);
    expect(result.current.isVisible).toBe(true);
  });

  it('lifts by the reported height untouched on Android, where the bar is already excluded', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockKeyboard.height = 300;
    mockKeyboard.isVisible = true;
    mockInsets.bottom = 48; // three-button navigation bar

    const { result } = renderHook(() => useKeyboardLift());

    expect(result.current.lift).toBe(300);
    expect(result.current.rawHeight).toBe(300);
  });

  it('never lifts below zero on an iPhone without a home indicator', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockKeyboard.height = 20;
    mockKeyboard.isVisible = true;
    mockInsets.bottom = 34;

    const { result } = renderHook(() => useKeyboardLift());

    expect(result.current.lift).toBe(0);
  });

  it('reports no lift while the keyboard is down, whatever the last height was', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockKeyboard.height = 300;
    mockKeyboard.isVisible = false;

    const { result } = renderHook(() => useKeyboardLift());

    expect(result.current.lift).toBe(0);
    expect(result.current.isVisible).toBe(false);
  });
});

describe('useKeyboardOffset', () => {
  it('is the top inset the root SafeAreaView spent plus the chrome above the view', () => {
    mockInsets.top = 47;

    const { result } = renderHook(() => useKeyboardOffset(64));

    expect(result.current).toBe(111);
  });

  it('is just the top inset when the view is the outermost element', () => {
    mockInsets.top = 47;

    const { result } = renderHook(() => useKeyboardOffset());

    expect(result.current).toBe(47);
  });
});
