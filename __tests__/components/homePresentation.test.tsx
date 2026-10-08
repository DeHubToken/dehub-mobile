import { act, create } from 'react-test-renderer';
import React from 'react';
import { useCinematicPhone } from '../../hooks/useCinematicPhone';
import { getThemeColors, isAppThemeName } from '../../theme/colors';

let mockTheme = 'system';
let mockDimensions = { width: 390, height: 844 };
jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('react-native', () => ({ useWindowDimensions: () => mockDimensions }));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ theme: mockTheme, skin: null }) }));

it('keeps System boxed and preserves the phone layout only in Immersive, including rotation', () => {
  let cinematic = false;
  function Probe() { cinematic = useCinematicPhone(); return null; }
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<Probe />); });
  expect(cinematic).toBe(false);
  mockTheme = 'immersive';
  act(() => tree!.update(<Probe />));
  expect(cinematic).toBe(true);
  mockDimensions = { width: 844, height: 390 };
  act(() => tree!.update(<Probe />));
  expect(cinematic).toBe(true);
  mockTheme = 'system';
  act(() => tree!.update(<Probe />));
  expect(cinematic).toBe(false);
  expect(isAppThemeName('immersive')).toBe(true);
  expect(getThemeColors('immersive')).toBe(getThemeColors('system'));
  act(() => tree!.unmount());
});
