import React from 'react';
import { act, create } from 'react-test-renderer';
import { FrostedBackdropProvider, FrostedBackground, FrostedContent, useFrostedSource } from '../../components/ui/FrostedBackdrop';

jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ Platform: { OS: 'android', Version: 36 }, View: 'View', StyleSheet: { absoluteFill: {} } }));
jest.mock('expo-blur', () => ({ BlurTargetView: 'BlurTargetView' }));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => jest.requireActual('react').useEffect(callback, [callback]),
}));

it('samples only the backdrop inside a standalone overlay while normal navigation keeps its feed target', () => {
  const sources: Record<string, unknown> = {};
  const Probe = ({ name }: { name: string }) => { sources[name] = useFrostedSource(); return null; };
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <FrostedBackdropProvider backdrop={null}>
        <FrostedContent><Probe name="background" /></FrostedContent>
        <Probe name="navigation" />
        <FrostedBackground><Probe name="profile" /></FrostedBackground>
      </FrostedBackdropProvider>,
    );
  });
  expect(sources.profile).toBeDefined();
  expect(sources.profile).toBe(sources.background);
  expect(sources.profile).not.toBe(sources.navigation);
  act(() => tree.unmount());
});
