import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('../../context/CallContext', () => ({ useCall: () => mockCall }));
import { CallDuration } from '../../components/Call/CallDuration';
import { visualActivity } from '../../libs/visualActivity';

const mockCall: { callStartedAt: number | null } = { callStartedAt: null };
let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(10_000);
  mockCall.callStartedAt = 10_000;
  visualActivity.setForeground(true);
  visualActivity.setFocused(true);
  visualActivity.setCall(false, false);
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('advances inside an Android call modal without enabling the covered feed', () => {
  visualActivity.setCall(true, true);
  visualActivity.setFocused(false);
  act(() => { tree = create(<CallDuration fallback="Connecting" />); });
  expect(tree!.toJSON()).toBe('00:00');
  act(() => { jest.advanceTimersByTime(3_000); });
  expect(tree!.toJSON()).toBe('00:03');
  expect(visualActivity.isFeedPlaybackAllowed()).toBe(false);
  expect(visualActivity.isVisualActive()).toBe(false);

  act(() => { visualActivity.setForeground(false); });
  act(() => { jest.advanceTimersByTime(5_000); });
  expect(tree!.toJSON()).toBe('00:03');
  act(() => { visualActivity.setForeground(true); });
  expect(tree!.toJSON()).toBe('00:08');
  act(() => { jest.advanceTimersByTime(1_000); });
  expect(tree!.toJSON()).toBe('00:09');
});

it('keeps the connecting label until the remote party joins', () => {
  mockCall.callStartedAt = null;
  act(() => { tree = create(<CallDuration fallback="Connecting" />); });
  act(() => { jest.advanceTimersByTime(4_000); });
  expect(tree!.toJSON()).toBe('Connecting');
});
