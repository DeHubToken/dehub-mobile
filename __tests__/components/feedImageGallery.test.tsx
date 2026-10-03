import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import FeedImageGallery from '../../components/Home/FeedImageGallery';

jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('../../components/common/SmartImage', () => ({ warmFeedImage: jest.fn() }));
jest.mock('../../hooks/useDataSaver', () => ({ useDataSaver: () => ({ liteMode: false }) }));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView',
  StyleSheet: { flatten: (style: unknown) => style },
}));
jest.mock('../../components/Home/ContainedFeedImage', () => ({
  __esModule: true,
  default: ({ uri, drawBitmap }: { uri: string; drawBitmap: boolean }) => drawBitmap
    ? require('react').createElement(require('react-native').View, { testID: uri }) : null,
}));

it('releases distant gallery pictures, retains every slide, and reloads pictures on scroll-back', () => {
  const screen = render(<FeedImageGallery images={['a', 'b', 'c', 'd']} width={300} fallbackWidth={300}
    active prioritizeMedia={false} onLayout={jest.fn()} onImagePress={jest.fn()} onReaction={jest.fn()} />);
  fireEvent(screen.getByTestId('feed-image-gallery'), 'layout', { nativeEvent: { layout: { width: 300 } } });
  for (let index = 0; index < 4; index++) {
    fireEvent(screen.getByTestId(`feed-gallery-slide-${index}`), 'layout', { nativeEvent: { layout: { x: index * 308, width: 300 } } });
  }
  expect(screen.getByTestId('a')).toBeTruthy();
  expect(screen.getByTestId('b')).toBeTruthy();
  expect(screen.queryByTestId('c')).toBeNull();
  expect(screen.queryByTestId('d')).toBeNull();
  fireEvent.scroll(screen.getByTestId('feed-image-gallery'), { nativeEvent: { contentOffset: { x: 700 } } });
  expect(screen.queryByTestId('a')).toBeNull();
  expect(screen.queryByTestId('b')).toBeNull();
  expect(screen.getByTestId('c')).toBeTruthy();
  expect(screen.getByTestId('d')).toBeTruthy();
  expect(screen.getByTestId('feed-gallery-slide-0')).toBeTruthy();
  fireEvent.scroll(screen.getByTestId('feed-image-gallery'), { nativeEvent: { contentOffset: { x: 0 } } });
  expect(screen.getByTestId('a')).toBeTruthy();
  expect(screen.queryByTestId('d')).toBeNull();
});
