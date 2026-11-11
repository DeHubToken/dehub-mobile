import React from 'react';
import { act, create } from 'react-test-renderer';
import { UserProfileSheetProvider, useUserProfileSheet, useUserProfilePresentation } from '../../context/UserProfileSheetContext';
import { FeedPlaybackActiveContext } from '../../libs/visualActivity';

jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View', Platform: { OS: 'android' } }));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ theme: 'hazy' }) }));
jest.mock('../../hooks/useUserProfileData', () => ({ prefetchUserProfile: jest.fn() }));
jest.mock('../../components/UserProfile/UserProfileBottomSheet', () => {
  const React = require('react');
  const element = require('react').createElement;
  return function Profile(props: { visible: boolean }) {
    const [commentsOpen, setCommentsOpen] = React.useState(false);
    const { useUserProfilePresentation } = require('../../context/UserProfileSheetContext');
    function Comments() {
      const state = useUserProfilePresentation();
      return element('Comments', { identifier: state.profileIdentifier });
    }
    return element('Profile', { ...props, openComments: () => setCommentsOpen(true) },
      commentsOpen ? element(Comments) : null);
  };
});
jest.mock('../../components/UserProfile/ProfileSurface', () => ({ PROFILE_CLOSE_MS: 180 }));
jest.mock('../../libs/deeplink.events', () => ({ setProfileDeepLinkHandler: jest.fn(), setProfileSheetCloser: jest.fn() }));
jest.mock('../../libs/visualActivity', () => ({ FeedPlaybackActiveContext: require('react').createContext(true) }));

it('keeps the previous page behind profile transitions without unmounting it', () => {
  jest.useFakeTimers();
  const mounted = jest.fn();
  const unmounted = jest.fn();
  let profile!: ReturnType<typeof useUserProfileSheet>;
  function Page() {
    profile = useUserProfileSheet();
    React.useEffect(() => { mounted(); return unmounted; }, []);
    return require('react').createElement('UnderlyingPage', { active: React.useContext(FeedPlaybackActiveContext) });
  }
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<UserProfileSheetProvider><Page /></UserProfileSheetProvider>); });
  const coveredPage = () => tree.root.findAllByType('View' as any).find(view => view.props.pointerEvents !== undefined)!;
  act(() => profile.showUserProfile('member'));
  expect(tree.root.findByType('UnderlyingPage' as any).props.active).toBe(true);
  expect(coveredPage().props.style.transform).toBeUndefined();
  expect(coveredPage().props.pointerEvents).toBe('none');
  act(() => tree.root.findByType('Profile' as any).props.onOpenComplete());
  expect(tree.root.findByType('UnderlyingPage' as any).props.active).toBe(false);
  expect(coveredPage().props.style.transform).toEqual([{ translateX: 100000 }]);
  expect(coveredPage().props.pointerEvents).toBe('none');
  expect(coveredPage().props.importantForAccessibility).toBe('no-hide-descendants');
  act(() => profile.hideUserProfile());
  expect(tree.root.findByType('UnderlyingPage' as any).props.active).toBe(false);
  expect(coveredPage().props.style.transform).toBeUndefined();
  expect(coveredPage().props.pointerEvents).toBe('none');
  // The press-time clock alone no longer drops the profile mid-fade.
  act(() => jest.advanceTimersByTime(180));
  expect(tree.root.findByType('UnderlyingPage' as any).props.active).toBe(false);
  act(() => tree.root.findByType('Profile' as any).props.onCloseComplete());
  expect(tree.root.findByType('UnderlyingPage' as any).props.active).toBe(true);
  expect(coveredPage().props.style.transform).toBeUndefined();
  expect(coveredPage().props.pointerEvents).toBe('auto');
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(unmounted).not.toHaveBeenCalled();
  // A second opening must retain the page until the new animation finishes.
  act(() => profile.showUserProfile('another-member'));
  expect(coveredPage().props.style.transform).toBeUndefined();
  act(() => tree.root.findByType('Profile' as any).props.onOpenComplete());
  expect(coveredPage().props.style.transform).toEqual([{ translateX: 100000 }]);
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

it('opens a profile over the page without re-rendering a page that only watches in-feed profiles', () => {
  const { useFeedProfilePresentation } = require('../../context/UserProfileSheetContext');
  let profile!: ReturnType<typeof useUserProfileSheet>;
  const renders = jest.fn();
  const seen: boolean[] = [];
  function Page() {
    profile = useUserProfileSheet();
    useFeedProfilePresentation();
    renders();
    React.useEffect(() => profile.subscribeProfileVisible((visible) => { seen.push(visible); }), []);
    return null;
  }
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<UserProfileSheetProvider><Page /></UserProfileSheetProvider>); });
  renders.mockClear();
  act(() => profile.showUserProfile('member'));
  expect(renders).not.toHaveBeenCalled();
  expect(profile.isProfileVisible()).toBe(true);
  act(() => profile.hideUserProfile());
  expect(profile.isProfileVisible()).toBe(false);
  expect(seen).toEqual([true, false]);
  act(() => tree.unmount());
});

it('keeps a closed profile built for a quick return, parked and silent', () => {
  jest.useFakeTimers();
  let profile!: ReturnType<typeof useUserProfileSheet>;
  function Page() {
    profile = useUserProfileSheet();
    return null;
  }
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<UserProfileSheetProvider><Page /></UserProfileSheetProvider>); });
  const sheet = () => tree.root.findByType('Profile' as any).props;
  act(() => profile.showUserProfile('member'));
  act(() => sheet().onOpenComplete());
  expect(sheet().parked).toBe(false);
  act(() => profile.hideUserProfile());
  act(() => sheet().onCloseComplete());
  // Closed: still handed the same profile, but parked.
  expect(sheet().visible).toBe(false);
  expect(sheet().usernameOrAddress).toBe('member');
  expect(sheet().parked).toBe(true);
  // Back into it: same profile, no longer parked.
  act(() => profile.showUserProfile('member'));
  expect(sheet().usernameOrAddress).toBe('member');
  expect(sheet().parked).toBe(false);
  act(() => profile.hideUserProfile());
  act(() => sheet().onCloseComplete());
  // Another profile replaces the parked one at once.
  act(() => profile.showUserProfile('other'));
  expect(sheet().usernameOrAddress).toBe('other');
  act(() => profile.hideUserProfile());
  act(() => sheet().onCloseComplete());
  expect(sheet().usernameOrAddress).toBe('other');
  // Left alone, the parked profile is let go.
  act(() => jest.advanceTimersByTime(45_000));
  expect(sheet().usernameOrAddress).toBeNull();
  expect(sheet().parked).toBe(false);
});
