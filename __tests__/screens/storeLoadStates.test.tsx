import React from 'react';
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { act, create, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => {
  const R = require('react');
  const FlatList = ({ data, renderItem, refreshControl, ListHeaderComponent, ListEmptyComponent }: any) =>
    R.createElement(
      'FlatList',
      null,
      refreshControl,
      ListHeaderComponent,
      data.length
        ? data.map((item: any) => R.createElement(R.Fragment, { key: item.id }, renderItem({ item })))
        : ListEmptyComponent,
    );
  return {
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    TextInput: 'TextInput',
    ActivityIndicator: 'ActivityIndicator',
    Modal: 'Modal',
    KeyboardAvoidingView: 'KeyboardAvoidingView',
    Switch: 'Switch',
    Alert: { alert: jest.fn() },
    FlatList,
    Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android },
    StyleSheet: {
      create: (s: unknown) => s,
      flatten: (s: unknown) => s,
      absoluteFill: {},
      absoluteFillObject: {},
      hairlineWidth: 1,
    },
    useWindowDimensions: () => ({ width: 400, height: 800 }),
  };
});
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('../../libs/date.util', () => ({ appLocale: () => 'en-US' }));
jest.mock('../../libs/pod-providers', () => ({
  POD_PROVIDERS: [],
  detectPodProvider: () => null,
  parsePodUrl: () => null,
  podProviderLabel: () => null,
}));
jest.mock('../../libs/misc', () => ({ getAvatarUrl: (u: string) => u }));
jest.mock('../../libs/permissions.util', () => ({ runWithPermissions: jest.fn() }));
jest.mock('../../libs/toast', () => ({ toastError: jest.fn(), toastSuccess: jest.fn() }));
jest.mock('../../libs/amount-input', () => ({ sanitizeAmountInput: (v: string) => v }));
jest.mock('../../theme', () => ({ theme: { colors: { accent: '#fff' } } }));
jest.mock('../../theme/minimal', () => ({
  MINIMAL_TAB_TEXT: {},
  MINIMAL_TAB_TEXT_ACTIVE: {},
  minimalRow: {},
  minimalTab: {},
  minimalTabActive: {},
  minimalTabStrip: {},
}));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ isMinimal: false }) }));
jest.mock('../../components/DeHubLoader', () => ({ DeHubLoader: 'DeHubLoader' }));
jest.mock('../../components/Feed/DeHubRefreshControl', () => ({
  DeHubRefreshControl: 'DeHubRefreshControl',
  DeHubRefreshMark: 'DeHubRefreshMark',
}));
jest.mock('../../components/ui/Icon', () => ({ __esModule: true, default: 'Icon' }));
jest.mock('../../components/common/Avatar', () => ({ __esModule: true, default: 'Avatar' }));
jest.mock('../../components/ScreenHeader', () => ({ __esModule: true, default: 'ScreenHeader' }));
jest.mock('../../components/common/ShareLinkButton', () => ({ __esModule: true, default: 'ShareLinkButton' }));
jest.mock('../../navigation/linking.config', () => ({
  ShareLinks: { store: (id: string) => `https://dehub.io/app/stores/${id}` },
}));

const mockNavigation = { canGoBack: jest.fn(() => true), goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: { storeId: 'store-1' } }),
}));

let mockStore: any;
let mockListings: any;
let mockMyStores: any;
const mutation = () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false });
jest.mock('../../hooks/useStores', () => ({
  useStoreById: () => mockStore,
  useStoreListings: () => mockListings,
  useMyStores: () => mockMyStores,
  useMyListings: () => ({ data: [] }),
  useMyOrders: () => ({ data: [] }),
  useCreateStore: mutation,
  useUpdateStore: mutation,
  useCreateListing: mutation,
  useUpdateListing: mutation,
  useUpdateOrderStatus: mutation,
  uploadStoreMedia: jest.fn(),
}));

import StoreDetailScreen from '../../screens/StoreDetailScreen';
import MyStoreTab from '../../components/Stores/MyStoreTab';

const query = (over: Record<string, unknown> = {}) => ({
  data: undefined,
  isLoading: false,
  isError: false,
  isRefetching: false,
  refetch: jest.fn(() => Promise.resolve()),
  ...over,
});

const textOf = (node: ReactTestInstance): string =>
  node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
const texts = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.type === 'Text').map(textOf);
const press = (tree: ReactTestRenderer, label: string) =>
  tree.root.find((n) => n.type === 'Pressable' && textOf(n) === label).props.onPress();

const render = (el: React.ReactElement) => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(el);
  });
  return tree;
};

const STORE = { id: 'store-1', name: 'Corner Shop', avatar_url: null, banner_url: null, description: null };

beforeEach(() => {
  mockNavigation.canGoBack.mockReturnValue(true);
  mockNavigation.goBack.mockClear();
  mockNavigation.navigate.mockClear();
});

describe('store detail load states', () => {
  it('says the store was not found and offers a way back for a deleted store', () => {
    mockStore = query({ data: null });
    mockListings = query({ data: [] });
    const tree = render(<StoreDetailScreen />);
    expect(tree.root.findAll((n) => n.type === 'ScreenHeader')).toHaveLength(1);
    expect(texts(tree)).toContain('stores.storeNotFound');
    expect(texts(tree)).not.toContain('stores.noActiveListings');
    press(tree, 'common.goBack');
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('shows a retry that reloads both queries when the store read fails', () => {
    mockStore = query({ isError: true });
    mockListings = query({ isError: true });
    const tree = render(<StoreDetailScreen />);
    expect(tree.root.findAll((n) => n.type === 'ScreenHeader')).toHaveLength(1);
    expect(texts(tree)).toContain('common.somethingWentWrong');
    expect(texts(tree)).not.toContain('stores.storeNotFound');
    press(tree, 'common.retry');
    expect(mockStore.refetch).toHaveBeenCalled();
    expect(mockListings.refetch).toHaveBeenCalled();
  });

  it('shows a listings failure instead of an empty shop, and pull-to-refresh reloads the store too', () => {
    mockStore = query({ data: STORE });
    mockListings = query({ data: [], isError: true });
    const tree = render(<StoreDetailScreen />);
    expect(texts(tree)).toContain('stores.loadFailed');
    expect(texts(tree)).not.toContain('stores.noActiveListings');
    act(() => {
      tree.root.find((n) => n.type === 'DeHubRefreshControl').props.onRefresh();
    });
    expect(mockStore.refetch).toHaveBeenCalled();
    expect(mockListings.refetch).toHaveBeenCalled();
  });

  it('keeps the loader up while listings are still loading after the store arrives', () => {
    mockStore = query({ data: STORE });
    mockListings = query({ isLoading: true });
    const tree = render(<StoreDetailScreen />);
    expect(tree.root.findAll((n) => n.type === 'DeHubLoader')).toHaveLength(1);
    expect(texts(tree)).not.toContain('stores.noActiveListings');
  });
});

describe('my store tab load states', () => {
  const tab = () => render(<MyStoreTab isAuthed onSignIn={jest.fn()} />);

  it('offers a retry, not the setup flow, when the store list fails with nothing cached', () => {
    mockMyStores = query({ isError: true });
    const tree = tab();
    expect(texts(tree)).toContain('common.failedToLoad');
    expect(texts(tree)).not.toContain('stores.openYourStore');
    press(tree, 'common.retry');
    expect(mockMyStores.refetch).toHaveBeenCalled();
  });

  it('keeps showing cached stores when a background refresh fails', () => {
    mockMyStores = query({ data: [STORE], isError: true });
    const tree = tab();
    expect(texts(tree)).not.toContain('common.failedToLoad');
    expect(texts(tree)).not.toContain('stores.openYourStore');
  });

  it('still shows the setup flow to a seller with no store', () => {
    mockMyStores = query({ data: [] });
    const tree = tab();
    expect(texts(tree)).toContain('stores.openYourStore');
  });
});

describe('store and mini app strings', () => {
  const dir = resolve(__dirname, '../../i18n/locales');
  const read = (file: string) => JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const en = read('en.json');

  it('translates store-not-found and the mini app host controls in every locale', () => {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json')) {
      const locale = read(file);
      const values = {
        storeNotFound: locale.stores?.storeNotFound,
        close: locale.miniApps?.host?.close,
        backToStore: locale.miniApps?.host?.backToStore,
        notFound: locale.miniApps?.host?.notFound,
      };
      const english = {
        storeNotFound: en.stores.storeNotFound,
        close: en.miniApps.host.close,
        backToStore: en.miniApps.host.backToStore,
        notFound: en.miniApps.host.notFound,
      };
      for (const [key, value] of Object.entries(values)) {
        expect([file, key, typeof value]).toEqual([file, key, 'string']);
        expect([file, key, value]).not.toEqual([file, key, english[key as keyof typeof english]]);
      }
    }
  });
});
