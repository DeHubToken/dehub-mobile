import { AppState, Platform } from 'react-native';
import { createVisualActivity, trackVisualActivity, visualActivity } from '../../libs/visualActivity';

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.restoreAllMocks(); jest.clearAllTimers(); jest.useRealTimers(); });

it('pauses covered visuals, keeps feed paused for minimized calls, and delays resume until foreground settles', () => {
  const activity = createVisualActivity();
  activity.setCall(true, true);
  expect(activity.isVisualActive()).toBe(false);
  activity.setCall(true, false); jest.advanceTimersByTime(250);
  expect(activity.isVisualActive()).toBe(true);
  expect(activity.isFeedPlaybackAllowed()).toBe(false);
  activity.setCall(false, false); activity.setForeground(false); activity.setForeground(true);
  jest.advanceTimersByTime(249); expect(activity.isVisualActive()).toBe(false);
  jest.advanceTimersByTime(1); expect(activity.isFeedPlaybackAllowed()).toBe(true);
  activity.dispose();
});

it('handles Android call shade blur/focus and iOS inactive/active without restarting media early', () => {
  const previousOS = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const listeners: Record<string, (value?: string) => void> = {};
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
    listeners[event] = listener as (value?: string) => void;
    return { remove };
  });
  visualActivity.setCall(false, false); visualActivity.setForeground(true); visualActivity.setFocused(true);
  const stop = trackVisualActivity();
  listeners.blur(); expect(visualActivity.isFeedPlaybackAllowed()).toBe(false);
  listeners.focus(); jest.advanceTimersByTime(250);
  expect(visualActivity.isFeedPlaybackAllowed()).toBe(true);
  listeners.change('inactive'); expect(visualActivity.isVisualActive()).toBe(false);
  listeners.change('active'); jest.advanceTimersByTime(249);
  expect(visualActivity.isVisualActive()).toBe(false);
  jest.advanceTimersByTime(1); expect(visualActivity.isVisualActive()).toBe(true);
  stop(); expect(remove).toHaveBeenCalledTimes(3);
  Object.defineProperty(Platform, 'OS', { configurable: true, value: previousOS });
});
