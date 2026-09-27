import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));

// Exercise the real provider while withholding its native measurement event.
jest.mock('react-native-safe-area-context/lib/commonjs/NativeSafeAreaProvider', () => ({
  NativeSafeAreaProvider: 'NativeSafeAreaProvider',
}));
jest.mock('react-native-safe-area-context', () => ({ initialWindowMetrics: null }));

const { SafeAreaProvider, useSafeAreaInsets } = require('react-native-safe-area-context/lib/commonjs/SafeAreaContext');
const { initialSafeAreaMetrics } = require('../../libs/initialSafeAreaMetrics');

it('mounts boot without an insets event and adopts later native measurements', () => {
  const mounted = jest.fn();
  let latestInsets: unknown;
  function Boot() {
    latestInsets = useSafeAreaInsets();
    React.useEffect(mounted, []);
    return null;
  }
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<SafeAreaProvider initialMetrics={initialSafeAreaMetrics}><Boot /></SafeAreaProvider>);
  });
  expect(mounted).toHaveBeenCalledTimes(1);
  const measured = { top: 32, bottom: 48, left: 0, right: 0 };
  act(() => {
    tree.root.findByType('NativeSafeAreaProvider').props.onInsetsChange({
      nativeEvent: { frame: initialSafeAreaMetrics.frame, insets: measured },
    });
  });
  expect(latestInsets).toEqual(measured);
  expect(mounted).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});
