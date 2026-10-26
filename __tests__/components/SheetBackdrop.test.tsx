import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import SheetBackdrop, { SHEET_BACKDROP_INTENSITY, useSheetBackdrop } from '../../components/ui/SheetBackdrop';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  Platform: { OS: 'android' }, View: 'View',
  StyleSheet: { absoluteFill: { position: 'absolute' } },
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
let mockSource: unknown = { current: {} };
let mockSurfaceActive = true;
jest.mock('../../components/ui/FrostedBackdrop', () => ({ useDrawerBlurSource: () => mockSource }));
jest.mock('../../libs/visualActivity', () => ({ useFeedSurfaceActive: () => mockSurfaceActive }));
let mockTheme = { isLight: false, isMinimal: false, skin: null as unknown };
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => mockTheme }));

const platform = jest.requireMock('react-native').Platform;
let tree: ReactTestRenderer;

function Probe({ active }: { active?: boolean }) {
  return <SheetBackdrop backdrop={useSheetBackdrop(active)} />;
}
const draw = (active?: boolean) => {
  act(() => { tree = create(<Probe active={active} />); });
  const blurs = tree.root.findAllByType('BlurView' as any);
  const scrim = tree.root.findAllByType('View' as any).at(-1)!.props.style[1].backgroundColor;
  return { blur: blurs[0]?.props, blurs: blurs.length, scrim };
};

beforeEach(() => {
  platform.OS = 'android';
  mockSource = { current: {} };
  mockSurfaceActive = true;
  mockTheme = { isLight: false, isMinimal: false, skin: null };
});
afterEach(() => act(() => tree?.unmount()));

it('blurs the feed on Android 12+ through the drawer source, under a light scrim', () => {
  const { blur, blurs, scrim } = draw();
  expect(blurs).toBe(1);
  expect(blur).toMatchObject({
    blurTarget: mockSource, blurMethod: 'dimezisBlurViewSdk31Plus', intensity: SHEET_BACKDROP_INTENSITY, tint: 'dark',
  });
  expect(scrim).toBe('rgba(0,0,0,0.3)');
  // The layer never takes the tap: the sheet's own press target dismisses.
  expect(tree.root.findAllByType('View' as any)[0].props.pointerEvents).toBe('none');
});

it('uses the system material on iOS, light in System Light', () => {
  platform.OS = 'ios';
  mockSource = undefined;
  mockTheme = { isLight: true, isMinimal: false, skin: null };
  const { blur, scrim } = draw();
  expect(blur.blurTarget).toBeUndefined();
  expect(blur).toMatchObject({ intensity: SHEET_BACKDROP_INTENSITY, tint: 'light' });
  // Pure black, so System Light's colour pass leaves it alone.
  expect(scrim).toBe('rgba(0,0,0,0.12)');
});

it.each([
  ['no feed to sample (or Android 11 and older)', () => { mockSource = undefined; }],
  ['a canvas theme', () => { mockTheme = { isLight: false, isMinimal: false, skin: { page: '#102d32' } }; }],
  ['the app in the background', () => { mockSurfaceActive = false; }],
])('falls back to a stronger tinted scrim with %s', (_, arrange) => {
  arrange();
  const { blurs, scrim } = draw();
  expect(blurs).toBe(0);
  expect(scrim).toBe('rgba(0,0,0,0.55)');
});

it('keeps Minimal flat on every platform', () => {
  for (const os of ['ios', 'android']) {
    platform.OS = os;
    mockTheme = { isLight: false, isMinimal: true, skin: null };
    const { blurs, scrim } = draw();
    expect(blurs).toBe(0);
    expect(scrim).toBe('rgba(0,0,0,0.6)');
    act(() => tree.unmount());
  }
});

it('samples nothing while the sheet is closed', () => {
  expect(draw(false).blurs).toBe(0);
  platform.OS = 'ios';
  expect(draw(false).blurs).toBe(0);
});
