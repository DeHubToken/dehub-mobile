import React from 'react';
import { act, create } from 'react-test-renderer';
import RouteLoadingShell from '../../navigation/RouteLoadingShell';

let mockReducedMotion = false;
const mockCancelAnimation = jest.fn();
const mockRepeat = jest.fn((..._args: unknown[]) => 1);
jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View', Pressable: 'Pressable', Text: 'Text' }));
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Path: 'Path' }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { createAnimatedComponent: (component: any) => component },
  useSharedValue: () => ({ value: 0 }), useReducedMotion: () => mockReducedMotion,
  useAnimatedProps: (read: () => unknown) => read(),
  withTiming: () => 1, withRepeat: (...args: unknown[]) => mockRepeat(...args),
  cancelAnimation: (...args: unknown[]) => mockCancelAnimation(...args), Easing: { linear: 'linear' },
}));
jest.mock('../../libs/jsx/tone', () => ({ KeepDarkScope: 'KeepDarkScope' }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ canGoBack: () => true }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24 }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

beforeEach(() => { mockReducedMotion = false; jest.clearAllMocks(); });

it('keeps a black preserved-color page, working Back, and only the custom dot artwork', () => {
  const back = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<RouteLoadingShell onBack={back} />); });
  expect(tree.root.findByProps({ testID: 'route-loading-shell' }).props.style.backgroundColor).toBe('#000000');
  expect(tree.root.findAllByType('KeepDarkScope' as any).length).toBeGreaterThan(0);
  expect(tree.root.findAllByType('Path' as any)).toHaveLength(3);
  expect(tree.root.findAllByType('Text' as any)).toHaveLength(1);
  act(() => tree.root.findByProps({ testID: 'route-loading-back' }).props.onPress());
  expect(back).toHaveBeenCalledTimes(1);
  expect(mockRepeat).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
  expect(mockCancelAnimation).toHaveBeenCalledTimes(1);
});

it('keeps all dots static for reduced motion without scheduling a loop', () => {
  mockReducedMotion = true;
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<RouteLoadingShell />); });
  expect(mockRepeat).not.toHaveBeenCalled();
  expect(tree.root.findAllByType('Path' as any).map(path => path.props.animatedProps.opacity)).toEqual([0.7, 0.7, 0.7]);
  act(() => tree.unmount());
});
