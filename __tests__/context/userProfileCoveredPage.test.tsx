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
jest.mock('../../libs/deeplink.events', () => ({ setProfileDeepLinkHandler: jest.fn() }));
jest.mock('../../libs/visualActivity', () => ({ FeedPlaybackActiveContext: require('react').createContext(true) }));

it('keeps the previous page behind profile transitions without unmounting it', () => {
  jest.useFakeTimers();
  const mounted = jest.fn();
  const unmounted = jest.fn();
  let profile!: ReturnType<typeof useUserProfileSheet>;
  function Page() {
    profile = useUserProfileSheet();
    React.useEffect(() => { mounted(); return unmounted; }, []);
    return React.createElement('UnderlyingPage', { active: React.useContext(FeedPlaybackActiveContext) });
  }
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<UserProfileSheetProvider><Page /></UserProfileSheetProvider>); });
  const coveredPage = () => tree.root.findAllByType('View' as any).find(view => view.props.pointerEvents !== undefined)!;
  act(() => profile.showUserProfile('member'));
  expect(tree.root.findByType('UnderlyingPage' as any).props.active).toBe(true);
  expect(coveredPage().props.style.display).toBe('flex');
  expect(coveredPage().props.pointerEvents).toBe('none');
  act(() => tree.root.findByType('Profile' as any).props.onOpenComplete());
  expect(tree.root.findByType('UnderlyingPage' as any).props.active).toBe(false);
  expect(coveredPage().props.style.display).toBe('none');
  expect(coveredPage().props.pointerEvents).toBe('none');
  expect(coveredPage().props.importantForAccessibility).toBe('no-hide-descendants');
  act(() => profile.hideUserProfile());
  expect(tree.root.findByType('UnderlyingPage' as any).props.active).toBe(false);
  expect(coveredPage().props.style.display).toBe('flex');
  expect(coveredPage().props.pointerEvents).toBe('none');
  act(() => jest.advanceTimersByTime(180));
  expect(tree.root.findByType('UnderlyingPage' as any).props.active).toBe(true);
  expect(coveredPage().props.style.display).toBe('flex');
  expect(coveredPage().props.pointerEvents).toBe('auto');
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(unmounted).not.toHaveBeenCalled();
  // A second opening must retain the page until the new animation finishes.
  act(() => profile.showUserProfile('another-member'));
  expect(coveredPage().props.style.display).toBe('flex');
  act(() => tree.root.findByType('Profile' as any).props.onOpenComplete());
  expect(coveredPage().props.style.display).toBe('none');
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
