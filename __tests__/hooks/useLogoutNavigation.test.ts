import { renderHook } from '@testing-library/react-native';
import { CommonActions, StackRouter } from '@react-navigation/routers';

const mockNavigation = { resetRoot: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));

import { useLogoutNavigation } from '../../hooks/useLogoutNavigation';
import { ScreenNames } from '../../navigation/ScreenNames';

const signedIn = { isSignedIn: true, needsUsername: false, isLoading: false, isBootLoading: false };
const guest = { ...signedIn, isSignedIn: false };

beforeEach(() => jest.clearAllMocks());

it('replaces authenticated navigation history with a fresh sign-in screen on logout', () => {
  const { rerender } = renderHook(useLogoutNavigation, { initialProps: signedIn });
  rerender({ ...guest, isLoading: true });
  expect(mockNavigation.resetRoot).not.toHaveBeenCalled();
  rerender(guest);

  const router = StackRouter({});
  const options = { routeNames: [ScreenNames.App, ScreenNames.Auth], routeParamList: {}, routeGetIdList: {} };
  const before = router.getRehydratedState({
    routes: [{ name: ScreenNames.App, state: { routes: [{ name: 'AccountSettings' }] } }],
  } as never, options);
  const after = router.getStateForAction(before, CommonActions.reset(mockNavigation.resetRoot.mock.calls[0][0]), options);
  expect(after?.routes.map(route => route.name)).toEqual([ScreenNames.Auth]);
  expect(after?.routes[0].state?.routes.map(route => route.name)).toEqual([ScreenNames.SignIn]);
  expect(after?.index).toBe(0);
  const settled = router.getRehydratedState(after!, options);
  expect(router.getStateForAction(settled, CommonActions.goBack(), options)).toBeNull();
});

it('keeps initial guest browsing and successful sign-in navigation intact', () => {
  const { rerender } = renderHook(useLogoutNavigation, { initialProps: guest });
  rerender({ ...guest, isBootLoading: true });
  rerender(guest);
  rerender(signedIn);
  expect(mockNavigation.resetRoot).not.toHaveBeenCalled();
});

it('does not redirect during a successful account switch', () => {
  const { rerender } = renderHook(useLogoutNavigation, { initialProps: signedIn });
  rerender({ ...signedIn, isLoading: true });
  rerender({ ...guest, isLoading: true });
  rerender({ ...signedIn, isLoading: true });
  rerender(signedIn);
  expect(mockNavigation.resetRoot).not.toHaveBeenCalled();
});

it('also leaves an abandoned provisional account and supports signing out again', () => {
  const { rerender } = renderHook(useLogoutNavigation, { initialProps: { ...guest, needsUsername: true } });
  rerender(guest);
  rerender(guest);
  expect(mockNavigation.resetRoot).toHaveBeenCalledTimes(1);
  rerender(signedIn);
  rerender(guest);
  expect(mockNavigation.resetRoot).toHaveBeenCalledTimes(2);
});
