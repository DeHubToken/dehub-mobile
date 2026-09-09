import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import MentionSuggestions from '../../components/common/MentionSuggestions';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    Platform: { OS: 'ios' },
    StyleSheet: {
      flatten: (style: unknown) => (typeof style === 'object' && style !== null ? style : {}),
    },
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    ActivityIndicator: 'ActivityIndicator',
    FlatList: ({ data, renderItem }: { data: unknown[]; renderItem: (args: { item: unknown }) => React.ReactNode }) =>
      ReactModule.createElement(
        ReactModule.Fragment,
        null,
        ...data.map((item) => renderItem({ item })),
      ),
  };
});
jest.mock('../../components/common/Avatar', () => 'Avatar');
jest.mock('../../libs', () => ({ getAvatarUrl: jest.fn(() => '') }));
jest.mock('../../libs/assistant', () => ({ isAssistantAddress: jest.fn(() => false) }));

const alice = {
  username: 'alice',
  displayName: 'Alice',
  avatarImageUrl: '',
  address: '0xalice',
  isFollowing: false,
};

describe('mention suggestions', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    jest.useRealTimers();
  });

  it('selects on Android touch-start without dispatching again on press', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <MentionSuggestions
        visible
        suggestions={[alice]}
        onSelect={onSelect}
      />,
    );
    const row = getByLabelText('Mention @alice');

    fireEvent(row, 'touchStart');
    fireEvent.press(row);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(alice);
  });

  it('keeps the normal press path on non-Android platforms', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <MentionSuggestions
        visible
        suggestions={[alice]}
        onSelect={onSelect}
      />,
    );
    const row = getByLabelText('Mention @alice');

    fireEvent(row, 'touchStart');
    fireEvent.press(row);

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
