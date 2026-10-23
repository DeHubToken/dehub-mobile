import { storage as draftStorage } from '../../libs/storage';
import { __resetDraftCacheForTests } from '../../libs/draft-cache';
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ShareToDmSheet from '../../components/DM/ShareToDmSheet';
import { ScreenNames } from '../../navigation/ScreenNames';

const mockNavigate = jest.fn();
const mockSendText = jest.fn(() => 'pending-message');
const mockDelivery = jest.fn(async () => true);
const mockStatus = jest.fn(async () => ({ perMessageFee: 0, freeAccessUsers: [] as string[] }));
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('../../context/WebSocketContext', () => ({ useWebSocketApi: () => ({}) }));
jest.mock('../../services/dm/dm.api', () => ({ getDmUserStatus: (...args: unknown[]) => (mockStatus as any)(...args) }));
jest.mock('../../services/dm/dm.send', () => ({ dmSendQueue: { init: jest.fn(), sendText: (...args: unknown[]) => (mockSendText as any)(...args), waitForDelivery: (...args: unknown[]) => (mockDelivery as any)(...args) } }));
function mockFlatList({ data, renderItem }: { data: unknown[]; renderItem: (info: { item: unknown; index: number }) => React.ReactNode }) {
  return <>{data.map((item, index) => <React.Fragment key={index}>{renderItem({ item, index })}</React.Fragment>)}</>;
}
jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', TextInput: 'TextInput', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (style: unknown) => style, flatten: (style: unknown) => Array.isArray(style) ? Object.assign({}, ...style) : style, absoluteFillObject: {} },
  FlatList: mockFlatList,
}));
jest.mock('@react-navigation/native', () => ({
  NavigationRouteContext: require('react').createContext(undefined), useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../components/common/BadgeArtwork', () => 'BadgeArtwork');
jest.mock('../../components/common/SmartImage', () => 'SmartImage');
jest.mock('../../components/common/Avatar', () => 'Avatar');
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');
jest.mock('../../components/ui/GlassModal', () => ({ children }: { children: React.ReactNode }) => children);
jest.mock('../../libs', () => ({ getAvatarUrl: () => undefined, toastSuccess: (...args: unknown[]) => mockToastSuccess(...args), toastError: (...args: unknown[]) => mockToastError(...args) }));
jest.mock('../../libs/misc', () => ({ getBadgeUrlFor: () => undefined }));
jest.mock('../../config', () => ({ WEBSITE_LINK: 'https://dehub.io' }));
jest.mock('../../context/AuthContext', () => ({ useUser: () => ({ id: 'me', address: '0xme' }) }));
jest.mock('../../store/dm.store', () => ({ useDmContacts: () => [{ _id: 'conversation' }] }));
jest.mock('../../services/dm/dm.types', () => ({ getOtherParticipant: () => ({ displayName: 'Pat', address: '0xpat' }) }));

afterEach(() => jest.clearAllMocks());

it('sends the bounty link directly and waits for delivery without opening chat', async () => {
  const close = jest.fn();
  const view = render(<ShareToDmSheet visible onClose={close} url="https://dehub.io/bounty/14" postTitle="iPad tester" />);
  fireEvent.press(view.getByText('Pat'));
  await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
  expect(close).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(mockSendText).toHaveBeenCalledWith(expect.objectContaining({
    conversationId: 'conversation', content: 'iPad tester\nhttps://dehub.io/bounty/14',
  }));
  expect(mockDelivery).toHaveBeenCalledWith('pending-message');
});

it('sends a post directly and prevents a double tap from sending twice', async () => {
  const view = render(<ShareToDmSheet visible onClose={jest.fn()} tokenId={42} />);
  fireEvent.press(view.getByText('Pat'));
  fireEvent.press(view.getByText('Pat'));
  await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
  expect(mockSendText).toHaveBeenCalledTimes(1);
  expect(mockSendText).toHaveBeenCalledWith(expect.objectContaining({ content: 'https://dehub.io/app/post/42' }));
  expect(mockNavigate).not.toHaveBeenCalled();
});

it('preserves payment confirmation for recipients requiring a fee', async () => {
  mockStatus.mockResolvedValueOnce({ perMessageFee: 5, freeAccessUsers: [] });
  const view = render(<ShareToDmSheet visible onClose={jest.fn()} tokenId={42} />);
  fireEvent.press(view.getByText('Pat'));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(ScreenNames.Chat, {
    conversationId: 'conversation', sharedText: 'https://dehub.io/app/post/42',
  }));
  expect(mockSendText).not.toHaveBeenCalled();
});

it('sends directly when the creator grants free access', async () => {
  mockStatus.mockResolvedValueOnce({ perMessageFee: 5, freeAccessUsers: ['0xME'] });
  const view = render(<ShareToDmSheet visible onClose={jest.fn()} tokenId={42} />);
  fireEvent.press(view.getByText('Pat'));
  await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
  expect(mockNavigate).not.toHaveBeenCalled();
});

it('shows failure instead of success when delivery is not confirmed', async () => {
  mockDelivery.mockResolvedValueOnce(false);
  const view = render(<ShareToDmSheet visible onClose={jest.fn()} tokenId={42} />);
  fireEvent.press(view.getByText('Pat'));
  await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('dm.failedToSend'));
  expect(mockToastSuccess).not.toHaveBeenCalled();
});

beforeEach(() => { draftStorage.delete('dehub-drafts-v1'); __resetDraftCacheForTests(); });
