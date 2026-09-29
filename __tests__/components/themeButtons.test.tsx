import React from 'react';
import { render } from '@testing-library/react-native';
import PrimaryButton from '../../components/ui/PrimaryButton';
import AccentButtonGradient from '../../components/ui/AccentButtonGradient';
import { APP_THEMES, type AppThemeName } from '../../theme/colors';
import { getThemeSkin } from '../../theme/skins';

let mockTheme: AppThemeName = 'system';
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('../../context/ThemeContext', () => ({
  useAppTheme: () => ({ skin: jest.requireActual('../../theme/skins').getThemeSkin(mockTheme) }),
}));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));

function flatten(style: any): Record<string, unknown> {
  return Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style ?? {};
}

it.each(APP_THEMES)('%s uses its own chrome on primary actions', (theme) => {
  mockTheme = theme;
  const view = render(<PrimaryButton title="Continue" />);
  const skin = getThemeSkin(theme);
  if (skin) {
    expect(view.UNSAFE_queryByType('LinearGradient' as any)).toBeNull();
    const fill = view.UNSAFE_getByType('View' as any);
    expect(flatten(fill.props.style)).toMatchObject(skin.centre);
    expect(flatten(view.UNSAFE_getByType('Text' as any).props.style).color).toBe(skin.centreIcon);
  } else {
    expect(view.UNSAFE_getByType('LinearGradient' as any)).toBeTruthy();
  }
});

it('replaces the previous material when the theme changes', () => {
  mockTheme = 'hazy';
  const view = render(<AccentButtonGradient style={{ backgroundColor: 'silver' }}>Action</AccentButtonGradient>);
  expect(flatten(view.UNSAFE_getByType('View' as any).props.style)).toMatchObject(getThemeSkin('hazy')!.centre);
  mockTheme = 'jungle';
  view.rerender(<AccentButtonGradient style={{ backgroundColor: 'silver' }}>Action</AccentButtonGradient>);
  expect(flatten(view.UNSAFE_getByType('View' as any).props.style)).toMatchObject(getThemeSkin('jungle')!.centre);
});
