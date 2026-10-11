import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { APP_THEMES, type AppThemeName } from '../../theme/colors';
import { getThemeSkin } from '../../theme/skins';
import { themeAccent, tintSkin } from '../../theme/themeColor';

let mockTheme: AppThemeName = 'system';
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: unknown) => styles, flatten: (style: any) => Array.isArray(style) ? Object.assign({}, ...style) : style, absoluteFill: {}, hairlineWidth: 1 },
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('../../components/ui/ThemeSurface', () => ({ __esModule: true, default: 'ThemeSurface' }));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => {
  const palette = jest.requireActual('../../theme/colors');
  const base = jest.requireActual('../../theme/skins').getThemeSkin(mockTheme);
  const colour = jest.requireActual('../../theme/themeColor');
  const accent = colour.themeAccent(mockTheme, {}, []);
  return { theme: mockTheme, skin: base && colour.tintSkin(base, accent), accent, isMinimal: mockTheme === 'minimal', colors: palette.getThemeColors(mockTheme) };
} }));

import { KitButton, PageSection, PageTabs } from '../../components/page/PageKit';
import { PageHeaderContext } from '../../components/page/PageHeaderContext';
import LiquidGlass from '../../components/ui/LiquidGlass';
import ThemePanel from '../../components/ui/ThemePanel';
const flatten = (style: any): any => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style ?? {};
const skinFor = (theme: AppThemeName) => {
  const base = getThemeSkin(theme);
  return base && tintSkin(base, themeAccent(theme, {}, []));
};

it.each(APP_THEMES)('%s header tabs fit the island without a second gutter and keep selection working', theme => {
  mockTheme = theme;
  const change = jest.fn();
  let tree!: ReactTestRenderer;
  const tabs = [{ id: 'browse', label: 'Browse' }, { id: 'sell', label: 'Sell' }];
  act(() => { tree = create(<PageHeaderContext.Provider value><PageTabs value="browse" onChange={change} tabs={tabs} /></PageHeaderContext.Provider>); });
  const strip = tree.root.findByType('ScrollView' as any);
  expect(flatten(strip.props.style)).toMatchObject({ height: 34, flexGrow: 0 });
  expect(flatten(strip.props.contentContainerStyle)).toMatchObject({ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 });
  const chips = tree.root.findAllByType('Pressable' as any);
  expect(chips[0].props.accessibilityState.selected).toBe(true);
  act(() => chips[1].props.onPress());
  expect(change).toHaveBeenCalledWith('sell');
  act(() => tree.update(<PageTabs value="browse" onChange={change} tabs={tabs} />));
  expect(tree.root.findByType('ScrollView' as any).props.style).toBeUndefined();
  act(() => tree.unmount());
});

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

it.each(APP_THEMES)('%s themed panels preserve geometry, content, and layout handlers', theme => {
  mockTheme = theme;
  const layout = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<ThemePanel onLayout={layout} style={{ backgroundColor: '#18181B', borderRadius: 20, padding: 24, maxHeight: '70%' }}><span /></ThemePanel>); });
  const frame = tree.root.findByType('View' as any);
  expect(flatten(frame.props.style)).toMatchObject({ borderRadius: 20, padding: 24, maxHeight: '70%' });
  const skin = skinFor(theme);
  expect(flatten(frame.props.style).backgroundColor).toBe(skin ? skin.card.backgroundColor : theme === 'minimal' ? '#000' : '#18181B');
  act(() => frame.props.onLayout({ nativeEvent: { layout: { height: 120 } } }));
  expect(layout).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByType('span')).toHaveLength(1);
  act(() => tree.unmount());
});

it('keeps a floating canvas-theme panel opaque and retains its corner', () => {
  mockTheme = 'hazy';
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<ThemePanel solid style={{ borderRadius: 20, padding: 24 }}><span /></ThemePanel>); });
  const frame = flatten(tree.root.findByType('View' as any).props.style);
  expect(frame.backgroundColor).toBe(skinFor('hazy')!.page);
  expect(frame.overflow).toBe('hidden');
  expect(tree.root.findByType('ThemeSurface' as any).props.radius).toBe(20);
  act(() => tree.unmount());
});
