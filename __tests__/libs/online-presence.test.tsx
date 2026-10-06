import { act, cleanup, renderHook } from '@testing-library/react-native';
import { getShowOnline, publishOnline, useIsOnline, usePresenceReaders } from '../../libs/online-presence';

jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }));
afterEach(() => { cleanup(); publishOnline(new Set()); });

it('keeps demand only for focused dots', () => {
  const hook = renderHook(({ focused }: { focused: boolean }) => ({
    online: useIsOnline('ALICE', focused), readers: usePresenceReaders(),
  }), { initialProps: { focused: true } });
  expect(hook.result.current.readers).toBe(true);
  act(() => publishOnline(new Set(['alice'])));
  expect(hook.result.current.online).toBe(true);
  hook.rerender({ focused: false });
  expect(hook.result.current.readers).toBe(false);
  expect(hook.result.current.online).toBe(false);
});

it('retains demand until all visible readers leave', () => {
  const host = renderHook(usePresenceReaders);
  const first = renderHook(() => useIsOnline('alice'));
  const second = renderHook(() => useIsOnline('alice'));
  first.unmount();
  expect(host.result.current).toBe(true);
  second.unmount();
  expect(host.result.current).toBe(false);
});

it('never opts in through an absent or disabled preference', () => {
  expect(getShowOnline(undefined)).toBe(false);
  expect(getShowOnline({ showOnline: 'off' })).toBe(false);
  expect(getShowOnline({ showOnline: 'on' })).toBe(true);
});
