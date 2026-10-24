import React from 'react';
import { act, create } from 'react-test-renderer';
import { UserProfileSheetProvider, useUserProfileSheet, useUserProfilePresentation } from '../../context/UserProfileSheetContext';

jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View', Platform: { OS: 'android' } }));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ theme: 'hazy' }) }));
jest.mock('../../components/UserProfile/UserProfileBottomSheet', () => jest.fn());
jest.mock('../../components/UserProfile/ProfileSurface', () => ({ PROFILE_CLOSE_MS: 180 }));
jest.mock('../../libs/deeplink.events', () => ({ setProfileDeepLinkHandler: jest.fn() }));
jest.mock('../../libs/visualActivity', () => ({ FeedPlaybackActiveContext: require('react').createContext(true) }));

// Keep rendered components outside the hoisted factory: NativeWind rewrites
// createElement references to a module import that Jest cannot hoist with it.
const profileSurface = jest.requireMock('../../components/UserProfile/UserProfileBottomSheet');
const CommentsHost = 'Comments' as unknown as React.ComponentType<{ identifier: string | null }>;
const ProfileHost = 'Profile' as unknown as React.ComponentType<{
  visible: boolean;
  openComments: () => void;
  children?: React.ReactNode;
}>;
function Comments() {
  const state = useUserProfilePresentation();
  return <CommentsHost identifier={state.profileIdentifier} />;
}
profileSurface.mockImplementation(function Profile(props: { visible: boolean }) {
  const [commentsOpen, setCommentsOpen] = React.useState(false);
  return <ProfileHost {...props} openComments={() => setCommentsOpen(true)}>
    {commentsOpen ? <Comments /> : null}
  </ProfileHost>;
});

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

it('keeps profile presentation available when a profile post opens comments', () => {
  let profile!: ReturnType<typeof useUserProfileSheet>;
  function Page() {
    profile = useUserProfileSheet();
    useUserProfilePresentation();
    return null;
  }
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<UserProfileSheetProvider><Page /></UserProfileSheetProvider>); });
  act(() => profile.showUserProfile('member'));
  act(() => tree.root.findByType('Profile' as any).props.openComments());
  expect(tree.root.findByType('Comments' as any).props.identifier).toBe('member');
  expect(tree.root.findByType('Profile' as any).props.visible).toBe(true);
  act(() => tree.unmount());
});
