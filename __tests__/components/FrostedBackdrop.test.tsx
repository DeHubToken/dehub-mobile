import React from 'react';
import { act, create } from 'react-test-renderer';
import { FrostedBackdropProvider, FrostedBackground, FrostedContent, useFrostedSource } from '../../components/ui/FrostedBackdrop';

jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ Platform: { OS: 'android', Version: 36 }, View: 'View', StyleSheet: { absoluteFill: {} } }));
jest.mock('expo-blur', () => ({ BlurTargetView: 'BlurTargetView' }));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => jest.requireActual('react').useEffect(callback, [callback]),
}));

it('keeps WebView backdrops outside blur capture while navigation samples the native feed', () => {
  const sources: Record<string, unknown> = {};
  const Probe = ({ name }: { name: string }) => { sources[name] = useFrostedSource(); return null; };
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <FrostedBackdropProvider backdrop={React.createElement("WebView" as any)}>
        <FrostedContent><Probe name="background" /></FrostedContent>
        <Probe name="navigation" />
        <FrostedBackground><Probe name="profile" /></FrostedBackground>
      </FrostedBackdropProvider>,
    );
  });
  expect(sources.profile).toBeUndefined();
  expect(sources.navigation).toBeDefined();
  const backdrop = tree.root.findByType("WebView" as any);
  expect(backdrop.parent?.type).not.toBe("BlurTargetView");
  expect(tree.root.findAllByType("BlurTargetView" as any)).toHaveLength(1);
  expect(sources.profile).toBe(sources.background);
  expect(sources.profile).not.toBe(sources.navigation);
  act(() => tree.update(
    <FrostedBackdropProvider backdrop={React.createElement("WebView" as any)}>
      <Probe name="navigation" />
    </FrostedBackdropProvider>,
  ));
  expect(sources.navigation).toBeUndefined();
  expect(tree.root.findAllByType("BlurTargetView" as any)).toHaveLength(0);
  act(() => tree.unmount());
});
