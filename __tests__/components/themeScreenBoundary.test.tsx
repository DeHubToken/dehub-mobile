import React, { useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import { ScreenErrorBoundary } from '../../components/common/ScreenErrorFallback';
import { ScreenNames } from '../../navigation/ScreenNames';

let mockTheme = 'system';
let mockLight = false;
jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ theme: mockTheme, isLight: mockLight }) }));
jest.mock('../../components/ErrorBoundary', () => ({ __esModule: true, default: ({ children }: any) => children }));
jest.mock('../../libs/crashRecovery', () => ({ restartApp: jest.fn() }));
jest.mock('../../components/common/SwipeBackBoundary', () => 'SwipeBackBoundary');
jest.mock('@expo/vector-icons/Ionicons', () => () => null);

it.each([
  ['Settings', 2],
  [ScreenNames.Root, 1],
])('refreshes %s content while preserving the tab navigator', (name, expectedMounts) => {
  mockTheme = 'system';
  const mounted = jest.fn();
  function Content() {
    useEffect(() => { mounted(); }, []);
    return null;
  }
  const element = <ScreenErrorBoundary name={name}><Content /></ScreenErrorBoundary>;
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(element); });
  expect(mounted).toHaveBeenCalledTimes(1);
  mockTheme = 'minimal';
  act(() => { tree!.update(<ScreenErrorBoundary name={name}><Content /></ScreenErrorBoundary>); });
  expect(mounted).toHaveBeenCalledTimes(expectedMounts);
  act(() => { tree!.unmount(); });
});

it('remounts screen content when System switches to System Light', () => {
  mockTheme = 'system';
  mockLight = false;
  const mounted = jest.fn();
  function Content() {
    useEffect(() => { mounted(); }, []);
    return null;
  }
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<ScreenErrorBoundary name="Home"><Content /></ScreenErrorBoundary>); });
  mockLight = true;
  act(() => { tree!.update(<ScreenErrorBoundary name="Home"><Content /></ScreenErrorBoundary>); });
  expect(mounted).toHaveBeenCalledTimes(2);
  act(() => { tree!.unmount(); });
});
