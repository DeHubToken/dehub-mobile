import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { FeedPlaybackActiveContext, useFeedPlaybackAllowed, visualActivity } from '../../libs/visualActivity';

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
