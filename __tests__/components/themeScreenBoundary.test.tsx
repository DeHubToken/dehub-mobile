import React, { useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import { ScreenErrorBoundary } from '../../components/common/ScreenErrorFallback';
import { ScreenNames } from '../../navigation/ScreenNames';

let mockTheme = 'system';
jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ theme: mockTheme }) }));
jest.mock('../../components/ErrorBoundary', () => ({ __esModule: true, default: ({ children }: any) => children }));
jest.mock('../../libs/crashRecovery', () => ({ restartApp: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

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
