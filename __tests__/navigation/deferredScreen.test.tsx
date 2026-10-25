import React from 'react';
import { act, create } from 'react-test-renderer';
import { deferredScreen } from '../../navigation/deferredScreen';
import { useTransitionSettled } from '../../hooks/useTransitionSettled';

let mockFocused = true;
let mockReducedMotion = false;
const mockRoute = { key: 'destination' };
const mockListeners = new Set<(event: any) => void>();
const mockNavigation = {
  addListener: (_name: string, listener: (event: any) => void) => {
    mockListeners.add(listener);
    return () => mockListeners.delete(listener);
  },
};
jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => mockRoute,
  useIsFocused: () => mockFocused,
}));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => mockReducedMotion }));
jest.mock('../../navigation/RouteLoadingShell', () => 'LoadingShell');

let key = 0;
beforeEach(() => {
  jest.useFakeTimers();
  mockFocused = true;
  mockReducedMotion = false;
  mockListeners.clear();
});
afterEach(() => jest.useRealTimers());

function page(immediate = false) {
  function Content() {
    const ready = useTransitionSettled();
    return require('react').createElement('Page', { ready });
  }
  const load = jest.fn(() => Content);
  const Screen = deferredScreen(`test-${key++}`, load, { immediateWhen: () => immediate });
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<Screen route={mockRoute} />); });
  return { load, Screen, tree };
}

it('paints cached content on entry while keeping expensive extras behind transition readiness', () => {
  const { load, tree } = page(true);
  expect(load).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByType('LoadingShell' as any)).toHaveLength(0);
  expect(tree.root.findByType('Page' as any).props.ready).toBe(false);
  act(() => { for (const listener of mockListeners) listener({ data: { closing: false } }); });
  expect(tree.root.findByType('Page' as any).props.ready).toBe(true);
  expect(load).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

it('commits the shell before requiring content, then mounts after the entrance without a second wait', () => {
  const { load, tree } = page();
  expect(tree.root.findAllByType('LoadingShell' as any)).toHaveLength(1);
  expect(load).not.toHaveBeenCalled();
  act(() => { for (const listener of mockListeners) listener({ data: { closing: false } }); });
  expect(load).toHaveBeenCalledTimes(1);
  expect(tree.root.findByType('Page' as any).props.ready).toBe(true);
  act(() => tree.unmount());
});

it('does not require content when Back blurs the page before its entrance finishes', () => {
  const { load, Screen, tree } = page();
  act(() => { mockFocused = false; tree.update(<Screen route={mockRoute} />); });
  act(() => { for (const listener of mockListeners) listener({ data: { closing: true } }); });
  act(() => jest.advanceTimersByTime(1000));
  expect(load).not.toHaveBeenCalled();
  act(() => tree.unmount());
});

it('cancels deferred work on unmount and removes the transition listener', () => {
  const { load, tree } = page();
  act(() => tree.unmount());
  act(() => jest.advanceTimersByTime(1000));
  expect(load).not.toHaveBeenCalled();
  expect(mockListeners.size).toBe(0);
});

it('loads after a bounded fallback if native transitionEnd is absent', () => {
  const { load, tree } = page();
  act(() => jest.advanceTimersByTime(599));
  expect(load).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1));
  expect(load).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

it('does not wait out an animation when reduced motion is enabled', () => {
  mockReducedMotion = true;
  const { load, tree } = page();
  act(() => jest.advanceTimersByTime(32));
  expect(load).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

it('retains already-mounted content on blur instead of replacing it with a shell', () => {
  const { load, Screen, tree } = page();
  act(() => jest.advanceTimersByTime(600));
  act(() => { mockFocused = false; tree.update(<Screen route={mockRoute} />); });
  expect(tree.root.findAllByType('LoadingShell' as any)).toHaveLength(0);
  expect(tree.root.findAllByType('Page' as any)).toHaveLength(1);
  expect(load).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

it('does not restart the loading gate when a theme boundary remounts an already-open route', () => {
  const { load, Screen, tree } = page();
  act(() => jest.advanceTimersByTime(600));
  act(() => tree.unmount());
  let remounted!: ReturnType<typeof create>;
  act(() => { remounted = create(<Screen route={mockRoute} />); });
  expect(remounted.root.findAllByType('LoadingShell' as any)).toHaveLength(0);
  expect(remounted.root.findByType('Page' as any).props.ready).toBe(true);
  expect(load).toHaveBeenCalledTimes(1);
  act(() => remounted.unmount());
});
