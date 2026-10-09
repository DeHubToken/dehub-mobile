import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { FeedPlaybackActiveContext, useFeedPlaybackAllowed, useFeedSurfaceActive, visualActivity } from '../../libs/visualActivity';

jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
beforeEach(() => {
  jest.useFakeTimers();
  visualActivity.setForeground(true);
  visualActivity.setFocused(true);
  visualActivity.setCall(false, false);
  jest.advanceTimersByTime(250);
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

it('pauses covered feeds while the profile can play, then resumes the revealed feed', () => {
  let active = false;
  const covered = renderHook(() => useFeedPlaybackAllowed(), {
    wrapper: ({ children }) => <FeedPlaybackActiveContext.Provider value={active}>{children}</FeedPlaybackActiveContext.Provider>,
  });
  const profile = renderHook(() => useFeedPlaybackAllowed());
  expect(covered.result.current).toBe(false);
  expect(profile.result.current).toBe(true);
  active = true;
  covered.rerender({});
  expect(covered.result.current).toBe(true);
});

it('still pauses the profile for the notification shade, backgrounding and calls', () => {
  const { result } = renderHook(() => useFeedPlaybackAllowed());
  act(() => visualActivity.setFocused(false));
  expect(result.current).toBe(false);
  act(() => { visualActivity.setFocused(true); jest.advanceTimersByTime(249); });
  expect(result.current).toBe(false);
  act(() => jest.advanceTimersByTime(1));
  expect(result.current).toBe(true);
  act(() => visualActivity.setForeground(false));
  expect(result.current).toBe(false);
  act(() => { visualActivity.setForeground(true); visualActivity.setCall(true, false); jest.advanceTimersByTime(250); });
  expect(result.current).toBe(false);
});

it('keeps a feed and its native sheet mounted on Android blur while pausing playback', () => {
  const { result } = renderHook(() => ({
    visible: useFeedSurfaceActive(),
    playing: useFeedPlaybackAllowed(),
  }));
  expect(result.current).toEqual({ visible: true, playing: true });
  act(() => visualActivity.setFocused(false));
  expect(result.current).toEqual({ visible: true, playing: false });
  act(() => { visualActivity.setFocused(true); jest.advanceTimersByTime(249); });
  expect(result.current).toEqual({ visible: true, playing: false });
  act(() => jest.advanceTimersByTime(1));
  expect(result.current).toEqual({ visible: true, playing: true });

  act(() => visualActivity.setForeground(false));
  expect(result.current).toEqual({ visible: false, playing: false });
  act(() => { visualActivity.setForeground(true); visualActivity.setCall(true, false); });
  expect(result.current).toEqual({ visible: false, playing: false });
});

it('still releases a feed surface when another route covers it', () => {
  let active = true;
  const { result, rerender } = renderHook(() => useFeedSurfaceActive(), {
    wrapper: ({ children }) => <FeedPlaybackActiveContext.Provider value={active}>{children}</FeedPlaybackActiveContext.Provider>,
  });
  expect(result.current).toBe(true);
  active = false;
  rerender({});
  expect(result.current).toBe(false);
});
