import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { APP_THEMES, type AppThemeName } from '../../theme/colors';
import { getThemeSkin } from '../../theme/skins';
import { themeAccent, tintSkin } from '../../theme/themeColor';

let mockTheme: AppThemeName = 'system';
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {}, hairlineWidth: 1 },
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => {
  const palette = jest.requireActual('../../theme/colors');
  const base = jest.requireActual('../../theme/skins').getThemeSkin(mockTheme);
  const colour = jest.requireActual('../../theme/themeColor');
  const accent = colour.themeAccent(mockTheme, {}, []);
  return { theme: mockTheme, skin: base && colour.tintSkin(base, accent), accent, isMinimal: mockTheme === 'minimal', colors: palette.getThemeColors(mockTheme) };
} }));

import { KitButton, PageSection } from '../../components/page/PageKit';
import LiquidGlass from '../../components/ui/LiquidGlass';
const flatten = (style: any): any => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style ?? {};
const skinFor = (theme: AppThemeName) => {
  const base = getThemeSkin(theme);
  return base && tintSkin(base, themeAccent(theme, {}, []));
};

it.each(APP_THEMES)('%s keeps page sections flat or in the theme material', theme => {
  mockTheme = theme;
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<PageSection style={{ backgroundColor: '#333333', borderRadius: 28, marginHorizontal: 22 }}>Content</PageSection>); });
  const frame = flatten(tree.root.findByType('View' as any).props.style);
  if (!skinFor(theme)) expect(frame).toMatchObject({ backgroundColor: 'transparent', borderRadius: 0, marginHorizontal: 0, borderBottomWidth: 1 });
  else expect(frame.backgroundColor).toBe(skinFor(theme)!.card.backgroundColor);
  act(() => tree.unmount());
});

it.each(APP_THEMES)('%s keeps primary and quiet button material separate from selected tab colour', theme => {
  mockTheme = theme;
  for (const variant of ['primary', 'quiet'] as const) {
    const press = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<KitButton label="Continue" variant={variant} onPress={press} />); });
    const frame = flatten(tree.root.findByType('View' as any).props.style);
    const skin = skinFor(theme);
    if (skin) expect(frame.backgroundColor).toBe(skin.centre.backgroundColor);
    else if (variant === 'primary') expect(frame.backgroundColor).toBe('#FFFFFF');
    act(() => tree.root.findByType('Pressable' as any).props.onPress());
    expect(press).toHaveBeenCalledTimes(1);
    act(() => tree.update(<KitButton label="Continue" variant={variant} disabled />));
    expect(tree.root.findByType('Pressable' as any).props.disabled).toBe(true);
    expect(tree.root.findByType('Pressable' as any).props.accessibilityState.disabled).toBe(true);
    act(() => tree.unmount());
  }
});

it.each(APP_THEMES)('%s raised panels keep the active material instead of System grey', theme => {
  mockTheme = theme;
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<LiquidGlass><span /></LiquidGlass>); });
  const fills = tree.root.findAllByType('View' as any).map(node => flatten(node.props.style));
  const skin = skinFor(theme);
  if (skin) expect(fills.some(style => style.backgroundColor === skin.card.backgroundColor)).toBe(true);
  else if (theme === 'minimal') expect(fills.some(style => style.backgroundColor === '#000')).toBe(true);
  expect(tree.root.findAllByType('span')).toHaveLength(1);
  act(() => tree.unmount());
});
