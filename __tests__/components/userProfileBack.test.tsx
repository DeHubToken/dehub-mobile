import React from 'react';
import { act, create } from 'react-test-renderer';
import UserProfileBottomSheet from '../../components/UserProfile/UserProfileBottomSheet';

jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View', TouchableOpacity: 'TouchableOpacity' }));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: 'GestureHandlerRootView' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0 }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({}) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../components/ScreenHeader', () => 'ScreenHeader');
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../components/UserProfile/UserProfileSheetContent', () => 'ProfileContent');
jest.mock('../../components/UserProfile/ProfileSurface', () => 'ProfileSurface');
jest.mock('../../components/UserProfile/UnfollowSheet', () => 'UnfollowSheet');
jest.mock('../../context/TabBarHideContext', () => ({ TabBarHideProvider: 'TabBarHideProvider' }));
jest.mock('../../navigation/StandaloneTabBar', () => 'StandaloneTabBar');
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ theme: 'osaka' }) }));

let mockProfileState: Record<string, unknown>;
jest.mock('../../hooks/useUserProfileData', () => ({ useUserProfileData: () => mockProfileState }));

it.each([
  ['loading', { loading: true }],
  ['failed', { loading: false, error: new Error('Request failed') }],
  ['loaded', { loading: false, profileData: { username: 'creator' } }],
])('can leave an embedded %s profile without the Home header', (_label, state) => {
  mockProfileState = state;
  const close = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<UserProfileBottomSheet embedded visible usernameOrAddress="creator" onClose={close} />); });
  const header = tree.root.findByType('ScreenHeader' as any);
  expect(header.props.canGoBack).toBe(true);
  act(() => header.props.onBackPress());
  expect(close).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});
