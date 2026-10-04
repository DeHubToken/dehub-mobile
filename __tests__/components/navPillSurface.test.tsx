import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Platform } from 'react-native';
import NavPillSurface, { NAV_PILL_RADIUS } from '../../components/ui/NavPillSurface';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  Platform: { OS: 'android', select: (options: any) => options.default },
  View: 'View', Image: 'Image',
  StyleSheet: { create: (styles: any) => styles, absoluteFill: { position: 'absolute' }, absoluteFillObject: { position: 'absolute' } },
}));
let mockTheme: any;
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => mockTheme }));
jest.mock('../../theme/colors', () => ({ MINIMAL_HAIRLINE: 'rgba(255,255,255,0.22)' }));
jest.mock('../../theme/skins', () => ({ GRAIN: 1, glassTint: (colour: string, alpha: number) => `${colour}:${alpha}` }));
jest.mock('../../components/ui/IosGlassPill', () => (props: any) => require('react').createElement('IosGlassPill', props));
jest.mock('../../components/theme/HudBrackets', () => (props: any) => require('react').createElement('HudBrackets', props));

let tree: ReactTestRenderer;
const flatten = (style: any): any => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style || {};
beforeEach(() => {
  mockTheme = { colors: { background: '#f9f8f4' }, isLight: false, isMinimal: false, skin: null };
  (Platform as any).OS = 'android';
});
afterEach(() => { act(() => tree?.unmount()); });

it('Android retains the bottom navigation solid fill and rim with no blur', () => {
  act(() => { tree = create(<NavPillSurface />); });
  const views = tree.root.findAllByType('View' as any).map(view => flatten(view.props.style));
  expect(views[0].backgroundColor).toBe('#18181B');
  expect(views[1]).toMatchObject({ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.10)' });
  expect(tree.root.findAllByType('IosGlassPill' as any)).toHaveLength(0);
});

it('iOS retains the bottom navigation liquid glass tint and radius', () => {
  (Platform as any).OS = 'ios';
  act(() => { tree = create(<NavPillSurface />); });
  expect(tree.root.findByType('IosGlassPill' as any).props).toMatchObject({ tint: '#18181B:0.22', borderRadius: NAV_PILL_RADIUS });
});

it.each(['isLight', 'isMinimal'])('iOS keeps %s solid', (mode) => {
  (Platform as any).OS = 'ios';
  mockTheme[mode] = true;
  act(() => { tree = create(<NavPillSurface />); });
  expect(tree.root.findAllByType('IosGlassPill' as any)).toHaveLength(0);
  expect(flatten(tree.root.findAllByType('View' as any)[0].props.style).backgroundColor).toBe(mode === 'isLight' ? '#f9f8f4' : '#000');
});

it('preserves a theme’s fill, rim, grain and brackets', () => {
  mockTheme.skin = { barFill: { backgroundColor: '#112233' }, barBorder: { borderRadius: 9, borderColor: '#aabbcc' }, grain: true, brackets: '#778899' };
  act(() => { tree = create(<NavPillSurface />); });
  const views = tree.root.findAllByType('View' as any).map(view => flatten(view.props.style));
  expect(views[0].backgroundColor).toBe('#112233');
  expect(views[1]).toMatchObject({ borderRadius: 9, borderColor: '#aabbcc' });
  expect(tree.root.findByType('Image' as any).props.resizeMode).toBe('repeat');
  expect(tree.root.findByType('HudBrackets' as any).props.color).toBe('#778899');
});
