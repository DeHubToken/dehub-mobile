import React from 'react';
import { render } from '@testing-library/react-native';
import PrimaryButton from '../../components/ui/PrimaryButton';
import AccentButtonGradient from '../../components/ui/AccentButtonGradient';
import GlassIndicator from '../../components/ui/GlassIndicator';
import ChromeSurface from '../../components/ui/ChromeSurface';
import { APP_THEMES, type AppThemeName } from '../../theme/colors';
import { getThemeSkin } from '../../theme/skins';
import { themeAccent, tintSkin } from '../../theme/themeColor';

let mockTheme: AppThemeName = 'system';
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('../../context/ThemeContext', () => ({
  useAppTheme: () => {
    const base = jest.requireActual('../../theme/skins').getThemeSkin(mockTheme);
    const colour = jest.requireActual('../../theme/themeColor');
    const accent = colour.themeAccent(mockTheme, {}, []);
    return { skin: base && colour.tintSkin(base, accent), isMinimal: mockTheme === 'minimal', accent };
  },
}));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Image: 'Image', TouchableOpacity: 'TouchableOpacity', Platform: { OS: 'android' },
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: { position: 'absolute' } },
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));

function skinFor(theme: AppThemeName) {
  const base = getThemeSkin(theme);
  return base && tintSkin(base, themeAccent(theme, {}, []));
}

function flatten(style: any): Record<string, unknown> {
  return Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style ?? {};
}

it.each(APP_THEMES)('%s uses its own chrome on primary actions', (theme) => {
  mockTheme = theme;
  const view = render(<PrimaryButton title="Continue" />);
  const skin = skinFor(theme);
  if (skin) {
    expect(view.UNSAFE_queryByType('LinearGradient' as any)).toBeNull();
    const fill = view.UNSAFE_getByType('View' as any);
    expect(flatten(fill.props.style)).toMatchObject(skin.centre);
    expect(flatten(view.UNSAFE_getByType('Text' as any).props.style).color).toBe(skin.centreIcon);
  } else if (theme === 'minimal') {
    expect(view.UNSAFE_queryByType('LinearGradient' as any)).toBeNull();
    expect(flatten(view.UNSAFE_getByType('View' as any).props.style)).toMatchObject({ backgroundColor: '#000', borderRadius: 0 });
  } else {
    expect(view.UNSAFE_getByType('LinearGradient' as any)).toBeTruthy();
  }
});

it('replaces the previous material when the theme changes', () => {
  mockTheme = 'hazy';
  const view = render(<AccentButtonGradient style={{ backgroundColor: 'silver' }}>Action</AccentButtonGradient>);
  expect(flatten(view.UNSAFE_getByType('View' as any).props.style)).toMatchObject(skinFor('hazy')!.centre);
  mockTheme = 'jungle';
  view.rerender(<AccentButtonGradient style={{ backgroundColor: 'silver' }}>Action</AccentButtonGradient>);
  expect(flatten(view.UNSAFE_getByType('View' as any).props.style)).toMatchObject(skinFor('jungle')!.centre);
});

it.each(APP_THEMES.filter(theme => !!getThemeSkin(theme)))('%s has no System gradient on icon controls or surrounding chrome', (theme) => {
  mockTheme = theme;
  const view = render(<><GlassIndicator /><ChromeSurface radius={15} tinted /></>);
  expect(view.UNSAFE_queryByType('LinearGradient' as any)).toBeNull();
  expect(view.UNSAFE_queryByType('BlurView' as any)).toBeNull();
  const skin = skinFor(theme)!;
  expect(skin.centre.backgroundColor).toBe(skin.card.backgroundColor);
  expect(skin.centre.borderColor).toBe(skin.card.borderColor);
});
