import React from 'react';
import { act, create } from 'react-test-renderer';
import UserProfileBottomSheet from '../../components/UserProfile/UserProfileBottomSheet';

jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('../../navigation/RouteLoadingShell', () => 'LoadingShell');
jest.mock('../../components/UserProfile/ProfileSurface', () => ({
  __esModule: true, PROFILE_OPEN_MS: 220,
  default: (props: any) => require('react').createElement('ProfileSurface', props, props.children),
}));
jest.mock('../../components/UserProfile/UserProfilePageContent', () => ({
  __esModule: true,
  default: (props: any) => require('react').createElement('ProfileBody', props),
}));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('opens a light Back-capable shell and mounts the real profile only after UI-thread completion', () => {
  const close = jest.fn();
  const complete = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<UserProfileBottomSheet visible usernameOrAddress="member" onClose={close} onOpenComplete={complete} />); });
  expect(tree.root.findAllByType('ProfileBody' as any)).toHaveLength(0);
  expect(tree.root.findByType('LoadingShell' as any).props.onBack).toBe(close);
  act(() => tree.root.findByType('ProfileSurface' as any).props.onOpenComplete());
  expect(tree.root.findAllByType('ProfileBody' as any)).toHaveLength(1);
  expect(complete).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

it('cancels the pending full-profile mount when closed before the entrance completes', () => {
  const close = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<UserProfileBottomSheet visible usernameOrAddress="member" onClose={close} />); });
  const oldComplete = tree.root.findByType('ProfileSurface' as any).props.onOpenComplete;
  act(() => { tree.update(<UserProfileBottomSheet visible={false} usernameOrAddress="member" onClose={close} />); });
  act(() => { oldComplete(); jest.advanceTimersByTime(1000); });
  expect(tree.root.findAllByType('ProfileBody' as any)).toHaveLength(0);
  act(() => tree.unmount());
});

it('recovers from a missing completion event and can load a replacement profile', () => {
  const close = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<UserProfileBottomSheet visible usernameOrAddress="first" onClose={close} />); });
  act(() => jest.advanceTimersByTime(320));
  expect(tree.root.findByType('ProfileBody' as any).props.usernameOrAddress).toBe('first');
  act(() => { tree.update(<UserProfileBottomSheet visible usernameOrAddress="second" onClose={close} />); });
  expect(tree.root.findAllByType('ProfileBody' as any)).toHaveLength(0);
  act(() => jest.advanceTimersByTime(320));
  expect(tree.root.findByType('ProfileBody' as any).props.usernameOrAddress).toBe('second');
  act(() => tree.unmount());
});
