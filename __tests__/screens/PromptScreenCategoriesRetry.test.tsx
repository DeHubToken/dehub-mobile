import { storage as draftStorage } from '../../libs/storage';
import { __resetDraftCacheForTests } from '../../libs/draft-cache';
jest.mock('../../context/AuthContext', () => ({ useUser: () => ({ address: 'draft-test' }) }));
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => {
  class Value {
    interpolate() { return '0deg'; }
  }
  return {
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    TextInput: 'TextInput',
    ScrollView: 'ScrollView',
    KeyboardAvoidingView: 'KeyboardAvoidingView',
    ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: (s: unknown) => s },
    Easing: { linear: (x: number) => x },
    Animated: {
      Value,
      View: 'AnimatedView',
      loop: () => ({ start: () => {}, stop: () => {} }),
      timing: () => ({}),
    },
    BackHandler: { addEventListener: () => ({ remove: () => {} }) },
  };
});
jest.mock('@react-native-community/slider', () => 'Slider');
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ isMinimal: false }) }));
jest.mock('../../theme/minimal', () => ({ MINIMAL_HAIRLINE: '#222', minimalRow: {} }));
jest.mock('../../libs/storage', () => {
  const values = new Map<string, string>();
  return { storage: {
    getString: jest.fn((key: string) => values.get(key)),
    set: jest.fn((key: string, value: unknown) => values.set(key, String(value))),
    delete: jest.fn((key: string) => values.delete(key)),
  } };
});
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const mockNavigation = { canGoBack: jest.fn(() => true), goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  NavigationRouteContext: require('react').createContext(undefined),
  useNavigation: () => mockNavigation,
  useFocusEffect: () => {},
}));

const mockGetCategoriesCached = jest.fn();
jest.mock('../../services/nft.service', () => ({
  getCategoriesCached: (...args: unknown[]) => mockGetCategoriesCached(...args),
}));

const mockUseKeyboardOffset = jest.fn((_chromeAbove?: number) => 24);
jest.mock('../../hooks/useKeyboardLayout', () => ({
  useKeyboardOffset: (...args: [number?]) => mockUseKeyboardOffset(...args),
}));

import PromptScreen from '../../screens/PromptScreen';

const textNodes = (tree: ReactTestRenderer, value: string) =>
  tree.root.findAll((node) => node.type === 'Text' && node.props.children === value);

const pressableWithText = (tree: ReactTestRenderer, value: string) =>
  tree.root.find(
    (node) => node.type === 'Pressable' && node.findAll((c) => c.type === 'Text' && c.props.children === value).length > 0,
  );

async function renderAtTuneStep() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<PromptScreen />); });
  act(() => tree.root.findByType('TextInput' as any).props.onChangeText('music videos'));
  act(() => tree.root.findByType('TextInput' as any).props.onSubmitEditing());
  act(() => { jest.advanceTimersByTime(1400); });
  return tree;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockGetCategoriesCached.mockReset();
  mockNavigation.navigate.mockReset();
  mockUseKeyboardOffset.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

// A failed category load used to leave the tune step on a spinner that never
// stopped, with Save still live and clearing the home category.
it('offers Retry instead of an endless spinner when categories fail to load, and recovers on retry', async () => {
  mockGetCategoriesCached.mockResolvedValueOnce([]);
  const tree = await renderAtTuneStep();

  expect(textNodes(tree, 'common.failedToLoad')).toHaveLength(1);
  expect(tree.root.findAllByType('ActivityIndicator' as any)).toHaveLength(0);
  expect(tree.root.findAllByType('Slider' as any)).toHaveLength(0);
  expect(pressableWithText(tree, 'promptFeed.save').props.disabled).toBe(true);

  mockGetCategoriesCached.mockResolvedValueOnce(['Music', 'Gaming']);
  await act(async () => { pressableWithText(tree, 'common.retry').props.onPress(); });

  expect(mockGetCategoriesCached).toHaveBeenLastCalledWith({ forceRefresh: true });
  expect(textNodes(tree, 'common.failedToLoad')).toHaveLength(0);
  expect(tree.root.findAllByType('Slider' as any)).toHaveLength(2);

  const save = pressableWithText(tree, 'promptFeed.save');
  expect(save.props.disabled).toBe(false);
  act(() => save.props.onPress());
  // Back to the Home already in the stack, not a second copy pushed on top.
  expect(mockNavigation.navigate).toHaveBeenCalledWith('Root', { screen: 'Home' }, { pop: true });
  act(() => tree.unmount());
});

it('keeps the spinner while the first load is still in flight', async () => {
  mockGetCategoriesCached.mockReturnValueOnce(new Promise(() => {}));
  const tree = await renderAtTuneStep();

  expect(tree.root.findAllByType('ActivityIndicator' as any)).toHaveLength(1);
  expect(textNodes(tree, 'common.failedToLoad')).toHaveLength(0);
  act(() => tree.unmount());
});

// The header is a sibling of the KeyboardAvoidingView, so only the root inset
// belongs in the offset; passing the header height again lifted the input 48pt
// above the keyboard.
it('does not add the header height to the keyboard offset', async () => {
  mockGetCategoriesCached.mockResolvedValueOnce(['Music']);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<PromptScreen />); });
  expect(mockUseKeyboardOffset).toHaveBeenCalled();
  expect(mockUseKeyboardOffset.mock.calls.every((args) => args.length === 0)).toBe(true);
  expect(tree.root.findByType('KeyboardAvoidingView' as any).props.keyboardVerticalOffset).toBe(24);
  act(() => tree.unmount());
});

beforeEach(() => { draftStorage.delete('dehub-drafts-v1'); __resetDraftCacheForTests(); });
