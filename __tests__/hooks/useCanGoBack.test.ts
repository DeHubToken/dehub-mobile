import { act, renderHook } from '@testing-library/react-native';

type Listener = () => void;
const listeners: Record<string, Listener[]> = {};
const unsubscribed: string[] = [];
let mockNavigation: any;

jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));

import { useCanGoBack } from '../../hooks/useCanGoBack';

const makeNavigation = () => ({
  canGoBack: jest.fn(() => false),
  getState: jest.fn(() => ({ type: 'stack', index: 0 })),
  addListener: jest.fn((event: string, cb: Listener) => {
    (listeners[event] ??= []).push(cb);
    return () => {
      unsubscribed.push(event);
      listeners[event] = (listeners[event] ?? []).filter((l) => l !== cb);
    };
  }),
});

const emit = (event: string) => act(() => (listeners[event] ?? []).forEach((cb) => cb()));

/** Mounts the hook and records the value of every render, first frame included. */
function mount() {
  const values: boolean[] = [];
  const { unmount } = renderHook(() => {
    const value = useCanGoBack();
    values.push(value);
    return value;
  });
  return { values, unmount, latest: () => values[values.length - 1] };
}

beforeEach(() => {
  Object.keys(listeners).forEach((k) => delete listeners[k]);
  unsubscribed.length = 0;
  mockNavigation = makeNavigation();
});

describe('hooks/useCanGoBack', () => {
  // The menu pushes through nested params: the stack renders the new screen
  // before it saves the push, so canGoBack() is stale on the first render but
  // getState() already shows the screen on top.
  it('is true on the first frame when the render-time stack has a screen to go back to', () => {
    mockNavigation.getState.mockReturnValue({ type: 'stack', index: 1 });
    const { values, unmount } = mount();
    expect(values[0]).toBe(true);
    unmount();
  });

  it('reads again after mount, for a screen that never renders again on its own', () => {
    mockNavigation.canGoBack.mockReturnValueOnce(false).mockReturnValue(true);
    const { values, latest, unmount } = mount();
    expect(values[0]).toBe(false);
    expect(latest()).toBe(true);
    unmount();
  });

  it('follows state changes of the navigator', () => {
    mockNavigation.canGoBack.mockReturnValue(true);
    const { latest, unmount } = mount();
    expect(latest()).toBe(true);
    mockNavigation.canGoBack.mockReturnValue(false);
    emit('state');
    expect(latest()).toBe(false);
    mockNavigation.getState.mockReturnValue({ type: 'stack', index: 2 });
    emit('state');
    expect(latest()).toBe(true);
    unmount();
  });

  it('follows focus', () => {
    const { latest, unmount } = mount();
    expect(latest()).toBe(false);
    mockNavigation.canGoBack.mockReturnValue(true);
    emit('focus');
    expect(latest()).toBe(true);
    unmount();
  });

  it('does not count the index of a tab navigator', () => {
    mockNavigation.getState.mockReturnValue({ type: 'tab', index: 2 });
    const { values, unmount } = mount();
    expect(values.every((v) => v === false)).toBe(true);
    unmount();
  });

  it('removes both listeners on unmount', () => {
    const { unmount } = mount();
    unmount();
    expect(unsubscribed.sort()).toEqual(['focus', 'state']);
  });

  it('works on a navigation object without addListener or getState', () => {
    mockNavigation = { canGoBack: () => true };
    const { values, unmount } = mount();
    expect(values.every((v) => v === true)).toBe(true);
    unmount();
  });
});
