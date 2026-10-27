import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { useActiveScreenEffect, useActiveScreenPolling, useScreenActivity } from '../../hooks/useScreenActivity';

it('releases work on blur/background and resumes once on focus/foreground', () => {
  jest.useFakeTimers();
  let focused = true;
  const events: Record<string, () => void> = {};
  const appEvents = new Set<(state: string) => void>();
  const appListener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, fn) => {
    appEvents.add(fn as any);
    return { remove: () => { appEvents.delete(fn as any); } };
  });
  const navigation = {
    isFocused: () => focused,
    addListener: (event: string, callback: () => void) => {
      // Both hooks may subscribe; fan out as the navigator does.
      const previous = events[event];
      events[event] = () => { previous?.(); callback(); };
      return jest.fn();
    },
  };
  const stop = jest.fn();
  const start = jest.fn(() => stop);
  const poll = jest.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => <NavigationContext.Provider value={navigation as any}>{children}</NavigationContext.Provider>;
  const hook = renderHook(() => { useActiveScreenEffect(start, []); useActiveScreenPolling(poll, 30000); return useScreenActivity(); }, { wrapper });
  expect(start).toHaveBeenCalledTimes(1);
  act(() => { focused = false; events.blur(); });
  expect(stop).toHaveBeenCalledTimes(1);
  expect(hook.result.current.isActive()).toBe(false);
  act(() => jest.advanceTimersByTime(90000));
  expect(poll).not.toHaveBeenCalled();
  act(() => { focused = true; events.focus(); });
  expect(start).toHaveBeenCalledTimes(2);
  expect(poll).toHaveBeenCalledTimes(1);
  act(() => { AppState.currentState = 'background'; appEvents.forEach(fn => fn('background')); });
  expect(stop).toHaveBeenCalledTimes(2);
  act(() => jest.advanceTimersByTime(90000));
  expect(poll).toHaveBeenCalledTimes(1);
  act(() => { AppState.currentState = 'active'; appEvents.forEach(fn => fn('active')); });
  expect(start).toHaveBeenCalledTimes(3);
  expect(poll).toHaveBeenCalledTimes(2);
  hook.unmount();
  expect(stop).toHaveBeenCalledTimes(3);
  appListener.mockRestore();
  jest.useRealTimers();
});
