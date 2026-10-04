import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ShareToDmSheet from '../../components/DM/ShareToDmSheet';
import { ScreenNames } from '../../navigation/ScreenNames';

const mockNavigate = jest.fn();
function mockFlatList({ data, renderItem }: { data: unknown[]; renderItem: (info: { item: unknown; index: number }) => React.ReactNode }) {
  return <>{data.map((item, index) => <React.Fragment key={index}>{renderItem({ item, index })}</React.Fragment>)}</>;
}
jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', TextInput: 'TextInput', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (style: unknown) => style, flatten: (style: unknown) => Array.isArray(style) ? Object.assign({}, ...style) : style, absoluteFillObject: {} },
  FlatList: mockFlatList,
}));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../components/common/BadgeArtwork', () => 'BadgeArtwork');
jest.mock('../../components/common/SmartImage', () => 'SmartImage');
jest.mock('../../components/common/Avatar', () => 'Avatar');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('../../components/ui/GlassModal', () => ({ children }: { children: React.ReactNode }) => children);
jest.mock('../../libs', () => ({ getAvatarUrl: () => undefined, toastSuccess: jest.fn() }));
jest.mock('../../libs/misc', () => ({ getBadgeUrlFor: () => undefined }));
jest.mock('../../config', () => ({ WEBSITE_LINK: 'https://dehub.io' }));
jest.mock('../../context/AuthContext', () => ({ useUser: () => ({ id: 'me' }) }));
jest.mock('../../store/dm.store', () => ({ useDmContacts: () => [{ _id: 'conversation' }] }));
jest.mock('../../services/dm/dm.types', () => ({ getOtherParticipant: () => ({ displayName: 'Pat' }) }));

afterEach(() => jest.clearAllMocks());

it('prefills the selected conversation with the bounty link rather than constructing a post URL', () => {
  const close = jest.fn();
  const view = render(<ShareToDmSheet visible onClose={close} url="https://dehub.io/bounty/14" postTitle="iPad tester" />);
  fireEvent.press(view.getByText('Pat'));
  expect(close).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith(ScreenNames.Chat, {
    conversationId: 'conversation', sharedText: 'iPad tester\nhttps://dehub.io/bounty/14',
  });
});

it('preserves post sharing for existing tokenId callers', () => {
  const view = render(<ShareToDmSheet visible onClose={jest.fn()} tokenId={42} />);
  fireEvent.press(view.getByText('Pat'));
  expect(mockNavigate).toHaveBeenCalledWith(ScreenNames.Chat, {
    conversationId: 'conversation', sharedText: 'https://dehub.io/app/post/42',
  });
});
