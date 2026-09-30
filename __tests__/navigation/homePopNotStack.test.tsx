import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { StackRouter, CommonActions } from '@react-navigation/routers';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView',
  Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android },
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
  I18nManager: { isRTL: false },
}));
jest.mock('../../context/ThemeContext', () => ({
  useAppTheme: () => ({ isMinimal: false, colors: { foreground: '#fff', accent: '#0af', neutrals: { 200: '#ddd', 400: '#999' } } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../components/common/SmartImage', () => 'SmartImage');
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../components/ui/GlassModal', () => ({ children }: { children: React.ReactNode }) => children);

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

const mockRefNavigate = jest.fn();
jest.mock('../../App', () => ({ navigationRef: { isReady: () => true, navigate: (...args: unknown[]) => mockRefNavigate(...args) } }));
const mockChooseCategory = jest.fn();
jest.mock('../../libs/eventBus', () => ({ promptFeedEvents: { chooseCategory: (c: string) => mockChooseCategory(c) } }));

const mockOnboarding = {
  steps: {}, settled: 0, total: 7, percentage: 0, complete: false,
  recordView: jest.fn(), markDone: jest.fn(), skip: jest.fn(), rate: jest.fn(), dismiss: jest.fn(),
};
jest.mock('../../context/OnboardingChecklistContext', () => ({ useOnboarding: () => mockOnboarding }));

import GettingStartedSheet from '../../components/Onboarding/GettingStartedSheet';
import { openCategoryFeed } from '../../libs/openCategoryFeed';
import { ONBOARDING_STEPS } from '../../libs/onboarding-steps';

const source = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');
const hasText = (node: { children: unknown[] }, text: string): boolean =>
  node.children.some((child) => child === text || (typeof child === 'object' && child !== null && hasText(child as never, text)));

beforeEach(() => jest.clearAllMocks());

// Why `pop` matters, and why it belongs in navigate's options: the App stack is
// [Root, <pushed page>], and a plain navigate to Root pushes a second tab
// navigator (and a second Home feed) instead of going back to the first.
describe('App stack router', () => {
  const router = StackRouter({});
  const options = { routeNames: ['Root', 'Careers'], routeParamList: {}, routeGetIdList: {} };
  const state = router.getRehydratedState({ routes: [{ name: 'Root' }, { name: 'Careers' }] } as never, options);
  const names = (s: any): string[] => s?.routes.map((r: { name: string }) => r.name);

  it('pops back to the Root already underneath when pop is an option', () => {
    const next = router.getStateForAction(state, CommonActions.navigate('Root', { screen: 'Home' }, { pop: true }) as never, options);
    expect(names(next)).toEqual(['Root']);
    expect((next as any)?.routes[0].key).toBe(state.routes[0].key);
  });

  it('stacks a second Root when pop is missing or buried in params', () => {
    for (const action of [CommonActions.navigate('Root', { screen: 'Home' }), CommonActions.navigate('Root', { screen: 'Home', pop: true })]) {
      const next = router.getStateForAction(state, action as never, options);
      expect(names(next)).toEqual(['Root', 'Careers', 'Root']);
    }
  });
});

it('a hashtag reaches Home through Root from any page, without stacking a second one', () => {
  openCategoryFeed(' Gaming ');
  expect(mockChooseCategory).toHaveBeenCalledWith('gaming');
  expect(mockRefNavigate).toHaveBeenCalledWith({ name: 'Root', params: { screen: 'Home' }, pop: true });
});

describe('Getting started checklist', () => {
  const render = () => {
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<GettingStartedSheet visible onClose={jest.fn()} />); });
    return tree;
  };
  const goButtons = (tree: ReactTestRenderer) =>
    tree.root.findAll((node) => node.type === 'TouchableOpacity' && hasText(node as never, 'onboarding.checklist.go'));

  it('sends the tab steps through Root and the rest straight to their screen', () => {
    const tabs = new Set<string>(['Home', 'Explore']);
    const tree = render();
    const buttons = goButtons(tree);
    expect(buttons).toHaveLength(ONBOARDING_STEPS.length);
    ONBOARDING_STEPS.forEach((step, i) => {
      mockNavigate.mockClear();
      act(() => buttons[i].props.onPress());
      if (tabs.has(step.screen)) {
        expect(mockNavigate).toHaveBeenCalledWith('Root', { screen: step.screen }, { pop: true });
      } else {
        expect(mockNavigate).toHaveBeenCalledWith(step.screen);
      }
    });
    act(() => tree.unmount());
  });

  it('wraps the step actions so Skip stays on the card in longer languages', () => {
    const tree = render();
    const row = goButtons(tree)[0].parent!;
    expect(row.props.style).toEqual(expect.objectContaining({ flexWrap: 'wrap' }));
    act(() => tree.unmount());
  });
});

it('trending topics on Explore filter the Home that is already open', () => {
  const screen = source('screens/SearchScreen.tsx');
  const handler = screen.slice(screen.indexOf('const handleTopicPress'), screen.indexOf('const handleSearch'));
  expect(handler).toContain('storage.set("dehub:defaultCategory", category)');
  expect(handler.indexOf('promptFeedEvents.chooseCategory(category)')).toBeGreaterThan(-1);
  expect(handler.indexOf('promptFeedEvents.chooseCategory(category)')).toBeLessThan(handler.indexOf('navigation.navigate('));
});

it('Go to profile after a top-up opens Profile, not a Root with a Profile tab that does not exist', () => {
  const status = source('components/Dpay/DpayCheckoutStatus.tsx');
  const goProfile = status.slice(status.indexOf('const goProfile'), status.indexOf('const isSuccess'));
  expect(goProfile).toContain('navigation.navigate(ScreenNames.Profile)');
  expect(goProfile).not.toContain('ScreenNames.Root');
});
