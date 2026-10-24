import React from 'react';
import { act, create } from 'react-test-renderer';
import { UserProfileSheetProvider, useUserProfileSheet } from '../../context/UserProfileSheetContext';

jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View', Platform: { OS: 'android' } }));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ theme: 'hazy' }) }));
jest.mock('../../components/UserProfile/UserProfileBottomSheet', () => 'Profile');
jest.mock('../../components/UserProfile/ProfileSurface', () => ({ PROFILE_CLOSE_MS: 180 }));
jest.mock('../../libs/deeplink.events', () => ({ setProfileDeepLinkHandler: jest.fn() }));
jest.mock('../../libs/visualActivity', () => ({ FeedPlaybackActiveContext: require('react').createContext(true) }));

it('hides the previous page through the profile close animation without unmounting it', () => {
  jest.useFakeTimers();
  const mounted = jest.fn();
  const unmounted = jest.fn();
  let profile!: ReturnType<typeof useUserProfileSheet>;
  function Page() {
    profile = useUserProfileSheet();
    React.useEffect(() => { mounted(); return unmounted; }, []);
    return 'underlying page';
  }
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<UserProfileSheetProvider><Page /></UserProfileSheetProvider>); });
  const coveredPage = () => tree.root.findAllByType('View' as any).find(view => view.props.pointerEvents !== undefined)!;
  act(() => profile.showUserProfile('member'));
  expect(coveredPage().props.style.display).toBe('none');
  expect(coveredPage().props.pointerEvents).toBe('none');
  expect(coveredPage().props.importantForAccessibility).toBe('no-hide-descendants');
  act(() => profile.hideUserProfile());
  expect(coveredPage().props.style.display).toBe('none');
  act(() => jest.advanceTimersByTime(180));
  expect(coveredPage().props.style.display).toBe('flex');
  expect(coveredPage().props.pointerEvents).toBe('auto');
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(unmounted).not.toHaveBeenCalled();
  act(() => tree.unmount());
  jest.useRealTimers();
});
