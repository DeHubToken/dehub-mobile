import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { NavigationContext, NavigationRouteContext } from '@react-navigation/native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import AndroidTabScene from '../../components/navigation/AndroidTabScene';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text',
  Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android },
  StyleSheet: { create: (styles: unknown) => styles },
  I18nManager: { isRTL: false },
}));

it('paints only the selected tab, without remounting the saved tab', () => {
  let selected = 'home';
  let mounts = 0;
  const listeners = new Map<string, Set<() => void>>();
  const navigation = {
    isFocused: () => true,
    getState: () => ({ index: selected === 'home' ? 0 : 1, routes: [{ key: 'home' }, { key: 'dm' }] }),
    addListener: (event: string, listener: () => void) => {
      const set = listeners.get(event) ?? new Set<() => void>();
      listeners.set(event, set);
      set.add(listener);
      return () => set.delete(listener);
    },
  };
  let updateValue: React.Dispatch<React.SetStateAction<string>>;
  function SavedTab() {
    const [value, setValue] = useState('initial');
    updateValue = setValue;
    useEffect(() => { mounts += 1; }, []);
    return <Text>{value}</Text>;
  }
  let tree: ReactTestRenderer;
  act(() => {
    tree = create(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={{ key: 'home', name: 'Home' } as never}>
          <AndroidTabScene><SavedTab /></AndroidTabScene>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  const scene = () => tree!.root.findByProps({ testID: 'android-tab-scene' });
  act(() => updateValue!('saved scroll/filter state'));
  expect(scene().props.pointerEvents).toBe('auto');
  act(() => {
    selected = 'dm';
    listeners.get('state')?.forEach(listener => listener());
  });
  expect(scene().props.style).toContainEqual({ opacity: 0 });
  expect(scene().props.pointerEvents).toBe('none');
  expect(scene().props.importantForAccessibility).toBe('no-hide-descendants');
  // Native keeps the full scene geometry while hidden. Do not collapse its
  // glass headers to a zero-width box as the web route cache previously did.
  const hiddenStyle = Object.assign({}, ...scene().props.style.filter(Boolean));
  expect(hiddenStyle.flex).toBe(1);
  expect(hiddenStyle.width).toBeUndefined();
  expect(hiddenStyle.height).toBeUndefined();
  expect(hiddenStyle.display).toBeUndefined();
  act(() => {
    selected = 'home';
    listeners.get('state')?.forEach(listener => listener());
  });
  expect(scene().props.style).not.toContainEqual({ opacity: 0 });
  expect(scene().props.pointerEvents).toBe('auto');
  expect(tree!.root.findByType(Text).props.children).toBe('saved scroll/filter state');
  expect(mounts).toBe(1);
  // A screen pushed over the tabs blurs them but leaves the tab selected:
  // the transparent Shorts viewer needs the feed painted underneath.
  act(() => listeners.get('blur')?.forEach(listener => listener()));
  expect(scene().props.style).not.toContainEqual({ opacity: 0 });
  act(() => tree!.unmount());
});
