import React from 'react';
import { act, create } from 'react-test-renderer';
import { PageSection } from '../../components/page/PageKit';
import { getThemeSkin } from '../../theme/skins';

let mockTheme: any;
jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: any) => styles, hairlineWidth: 0.5 },
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => mockTheme }));

it.each(['cosmic', 'island', 'war'] as const)('preserves the %s card material in page sections', (theme) => {
  const skin = getThemeSkin(theme)!;
  mockTheme = { theme, skin, isMinimal: false, colors: { card: '#18181B' } };
  let tree: ReturnType<typeof create>;
  const override = { paddingVertical: 12 };
  act(() => { tree = create(<PageSection style={override}>Content</PageSection>); });
  const frame = tree!.root.findByType('View' as any).props.style;
  expect(frame[1]).toBe(skin.card);
  expect(Object.assign({}, ...frame)).toMatchObject({ ...skin.card, ...override });
  act(() => tree!.unmount());
});

it.each(['system', 'minimal'] as const)('keeps %s sections flat between hairlines', (theme) => {
  mockTheme = { theme, skin: null, isMinimal: theme === 'minimal', colors: { card: '#18181B' } };
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<PageSection>Content</PageSection>); });
  const frame = Object.assign({}, ...tree!.root.findByType('View' as any).props.style);
  expect(frame.borderBottomWidth).toBe(0.5);
  expect(frame.backgroundColor).toBeUndefined();
  act(() => tree!.unmount());
});
