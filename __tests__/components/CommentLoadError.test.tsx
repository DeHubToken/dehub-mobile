import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { CommentLoadError } from '../../components/Comments/CommentLoadError';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput', ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: unknown) => styles, flatten: (styles: unknown) => styles },
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../components/page/PageKit', () => ({
  KitButton: ({ label, onPress, disabled }: any) => {
    const { Pressable, Text } = require('react-native');
    return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"><Text>{label}</Text></Pressable>;
  },
}));

it('retries a failed read and prevents repeated taps during recovery', () => {
  const retry = jest.fn();
  const screen = render(<CommentLoadError isFetching={false} onRetry={retry} />);
  expect(screen.getByText('comments.loadFailed')).toBeTruthy();
  fireEvent.press(screen.getByText('common.retry'));
  expect(retry).toHaveBeenCalledTimes(1);
  screen.rerender(<CommentLoadError isFetching onRetry={retry} />);
  fireEvent.press(screen.getByText('common.loading'));
  expect(retry).toHaveBeenCalledTimes(1);
});
