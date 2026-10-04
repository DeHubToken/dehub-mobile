import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));

// Hardware-back listeners currently registered, newest last.
const mockBackHandlers = new Set<() => boolean>();
jest.mock('react-native', () => {
  const R = require('react');
  const slot = (c: any) => (c == null ? null : R.isValidElement(c) ? c : R.createElement(c));
  return {
    View: 'View',
    Text: 'Text',
    TouchableOpacity: 'TouchableOpacity',
    Pressable: 'Pressable',
    ActivityIndicator: 'ActivityIndicator',
    Modal: 'Modal',
    TextInput: 'TextInput',
    KeyboardAvoidingView: 'KeyboardAvoidingView',
    StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
    Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android },
    Alert: { alert: jest.fn() },
    BackHandler: {
      addEventListener: (_event: string, cb: () => boolean) => {
        mockBackHandlers.add(cb);
        return { remove: () => mockBackHandlers.delete(cb) };
      },
    },
    FlatList: (props: any) =>
      R.createElement(
        'FlatList',
        null,
        slot(props.ListHeaderComponent),
        props.data.length === 0
          ? slot(props.ListEmptyComponent)
          : props.data.map((item: any, index: number) =>
              R.createElement(R.Fragment, { key: index }, props.renderItem({ item, index })),
            ),
      ),
  };
});

// Runs the effect only while the screen is focused, and cleans it up on blur,
// like the real hook does when a post is pushed on top.
let mockSetFocused: (focused: boolean) => void = () => {};
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const R = require('react');
    const [focused, setFocused] = R.useState(true);
    mockSetFocused = setFocused;
    R.useEffect(() => (focused ? effect() : undefined), [effect, focused]);
  },
}));
// Stable like the real t: fetchFoldersList depends on it.
const mockT = (key: string) => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('../../context/AuthContext', () => ({ useAuthState: () => ({ isSignedIn: true, needsUsername: false }) }));
jest.mock('../../hooks/useGateToHome', () => ({ useGateToHome: () => {} }));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ isMinimal: false }) }));
jest.mock('../../theme/minimal', () => ({
  MINIMAL_HAIRLINE: '#333',
  MINIMAL_INSET: 16,
  MINIMAL_TAB_TEXT: '#999',
  MINIMAL_TAB_TEXT_ACTIVE: '#fff',
  minimalFlat: {},
  minimalTab: {},
  minimalTabActive: {},
  minimalTabStrip: {},
}));
jest.mock('../../components/DeHubLoader', () => ({ DeHubLoader: () => null }));
jest.mock('../../components/Feed/DeHubRefreshControl', () => ({
  DeHubRefreshControl: () => null,
  DeHubRefreshMark: () => null,
}));
jest.mock('../../components/ui/LoadErrorState', () => () => null);
jest.mock('../../components/ScreenHeader', () => 'ScreenHeader');
jest.mock('../../components/page/PageKit', () => ({
  // Tabs as plain pressable labels, so the test can still tap "Collections".
  PageTabs: ({ tabs, onChange }: { tabs: { id: string; label: string }[]; onChange: (id: string) => void }) => {
    const R = require('react');
    return tabs.map((tab) =>
      R.createElement('TouchableOpacity', { key: tab.id, onPress: () => onChange(tab.id) }, R.createElement('Text', null, tab.label)),
    );
  },
  PageEmpty: () => null,
  KitButton: () => null,
}));
jest.mock('../../components/Profile/PostsInfiniteList', () => 'PostsInfiniteList');
jest.mock('../../components/ui/Icon', () => () => null);
jest.mock('../../components/ui/CustomSwitch', () => () => null);
jest.mock('../../libs', () => ({ toastError: jest.fn(), toastSuccess: jest.fn() }));
jest.mock('../../services/bookmark.service', () => ({
  getFolders: jest.fn(),
  createFolder: jest.fn(),
  updateFolder: jest.fn(),
  deleteFolder: jest.fn(),
}));

import SavedPostsScreen from '../../screens/SavedPostsScreen';
import { getFolders } from '../../services/bookmark.service';

const fetchFolders = getFolders as jest.Mock;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const pressText = (tree: ReactTestRenderer, label: string) => {
  let node = tree.root.find((n) => n.type === 'Text' && n.props.children === label);
  while (node.type !== 'TouchableOpacity') node = node.parent!;
  act(() => { node.props.onPress(); });
};
const openCollection = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => n.type === 'PostsInfiniteList' && n.props.variant === 'folder');
const pressBack = () => {
  const handlers = [...mockBackHandlers];
  let handled = false;
  act(() => { handled = handlers.length > 0 && handlers[handlers.length - 1](); });
  return handled;
};

let tree: ReactTestRenderer;

beforeEach(() => {
  mockBackHandlers.clear();
  fetchFolders.mockReset();
  fetchFolders.mockResolvedValue({ result: [{ _id: 'f1', name: 'Road trip', itemCount: 3 }] });
});

afterEach(() => act(() => tree?.unmount()));

it('leaves an open collection on Android back and refetches the list once', async () => {
  act(() => { tree = create(<SavedPostsScreen />); });
  pressText(tree, 'savedPosts.collections');
  await flush();
  expect(fetchFolders).toHaveBeenCalledTimes(1);

  // On the collections list back is left to the stack.
  expect(mockBackHandlers.size).toBe(0);

  pressText(tree, 'Road trip');
  expect(openCollection(tree)).toHaveLength(1);
  expect(mockBackHandlers.size).toBe(1);

  expect(pressBack()).toBe(true);
  await flush();
  expect(openCollection(tree)).toHaveLength(0);
  expect(tree.root.findAll((n) => n.type === 'Text' && n.props.children === 'Road trip')).toHaveLength(1);
  expect(mockBackHandlers.size).toBe(0);
  expect(fetchFolders).toHaveBeenCalledTimes(2);
});

it('does not catch back on a post opened from the collection', async () => {
  act(() => { tree = create(<SavedPostsScreen />); });
  pressText(tree, 'savedPosts.collections');
  await flush();
  pressText(tree, 'Road trip');

  // A post pushed on top blurs this screen: its back must close the post.
  act(() => mockSetFocused(false));
  expect(mockBackHandlers.size).toBe(0);

  // Coming back to the collection re-arms it.
  act(() => mockSetFocused(true));
  expect(mockBackHandlers.size).toBe(1);
  expect(openCollection(tree)).toHaveLength(1);
});
