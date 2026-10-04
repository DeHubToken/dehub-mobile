import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { DeHubRefreshControl, DeHubRefreshMark } from '../../components/Feed/DeHubRefreshControl';
import { useFeedPillRefreshing } from '../../libs/feed-pill-refresh';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ RefreshControl: 'RefreshControl' }));

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
  expect(control.props).toMatchObject({ refreshing: true, tintColor: 'transparent', colors: ['transparent'], progressBackgroundColor: 'transparent', progressViewOffset: 56 });
  act(() => control.props.onRefresh());
  expect(onRefresh).toHaveBeenCalledTimes(1);
});
