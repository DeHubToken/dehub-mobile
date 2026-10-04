import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { DeHubRefreshControl, DeHubRefreshMark } from '../../components/Feed/DeHubRefreshControl';
import { useFeedPillRefreshing } from '../../libs/feed-pill-refresh';
import { HomePullRefreshContext } from '../../context/HomePullRefreshContext';
import { Platform } from 'react-native';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native-css-interop', () => ({ createInteropElement: jest.requireActual('react').createElement }));
jest.mock('react-native', () => ({ RefreshControl: 'RefreshControl', Platform: { OS: 'android' } }));

function LogoState() {
  return React.createElement('LogoState', { refreshing: useFeedPillRefreshing() });
}
let tree: ReactTestRenderer;
const busy = () => tree.root.findByType('LogoState' as any).props.refreshing;
afterEach(() => { act(() => tree?.unmount()); });

it('renders no floating mark while signalling refresh to the logo, including before the logo mounts', () => {
  act(() => { tree = create(<DeHubRefreshMark refreshing />); });
  expect(tree.toJSON()).toBeNull();
  act(() => tree.update(<><DeHubRefreshMark refreshing /><LogoState /></>));
  expect(busy()).toBe(true);
  act(() => tree.update(<><DeHubRefreshMark refreshing={false} /><LogoState /></>));
  expect(busy()).toBe(false);
});

it('inactive home tabs cannot animate the logo', () => {
  act(() => { tree = create(<><DeHubRefreshMark pill={false} refreshing /><LogoState /></>); });
  expect(busy()).toBe(false);
  act(() => tree.update(<><DeHubRefreshMark pill refreshing /><LogoState /></>));
  expect(busy()).toBe(true);
  act(() => tree.update(<><DeHubRefreshMark pill={false} refreshing /><LogoState /></>));
  expect(busy()).toBe(false);
});

it('keeps the logo busy until every refresh owner finishes or unmounts', () => {
  const render = (second: boolean, firstBusy: boolean) => <><DeHubRefreshMark key="first" refreshing={firstBusy} />{second && <DeHubRefreshMark key="second" refreshing />}<LogoState /></>;
  act(() => { tree = create(render(true, true)); });
  expect(busy()).toBe(true);
  act(() => tree.update(render(true, false)));
  expect(busy()).toBe(true);
  act(() => tree.update(render(false, false)));
  expect(busy()).toBe(false);
});

it('retains the native refresh callback while hiding every native indicator colour', () => {
  const onRefresh = jest.fn();
  act(() => { tree = create(<DeHubRefreshControl refreshing onRefresh={onRefresh} tintColor="red" colors={['blue']} progressBackgroundColor="white" progressViewOffset={56} />); });
  const control = tree.root.findByType('RefreshControl' as any);
  expect(control.props).toMatchObject({ refreshing: true, tintColor: 'transparent', colors: ['transparent'], progressBackgroundColor: 'transparent', progressViewOffset: -1000 });
  act(() => control.props.onRefresh());
  expect(onRefresh).toHaveBeenCalledTimes(1);
});
it('retains the supplied refresh offset on iOS', () => {
  const platform = Platform as unknown as { OS: string };
  platform.OS = 'ios';
  try {
    act(() => { tree = create(<DeHubRefreshControl refreshing onRefresh={jest.fn()} progressViewOffset={56} />); });
    expect(tree.root.findByType('RefreshControl' as any).props.progressViewOffset).toBe(56);
  } finally { platform.OS = 'android'; }
});
it('hands the active home refresh to the spring gesture without parking the native wrapper', () => {
  const onRefresh = jest.fn(), unregister = jest.fn();
  let gestureRefresh: (() => void) | undefined;
  const register = jest.fn((refresh: () => void) => { gestureRefresh = refresh; return unregister; });
  act(() => { tree = create(<HomePullRefreshContext.Provider value={{ enabled: true, register }}><DeHubRefreshControl refreshing onRefresh={onRefresh} /></HomePullRefreshContext.Provider>); });
  const control = tree.root.findByType('RefreshControl' as any);
  expect(control.props).toMatchObject({ refreshing: false, enabled: false });
  act(() => gestureRefresh?.());
  expect(onRefresh).toHaveBeenCalledTimes(1);
  act(() => tree.update(<HomePullRefreshContext.Provider value={null}><DeHubRefreshControl refreshing onRefresh={onRefresh} /></HomePullRefreshContext.Provider>));
  expect(unregister).toHaveBeenCalledTimes(1);
  expect(tree.root.findByType('RefreshControl' as any).props.refreshing).toBe(true);
});
