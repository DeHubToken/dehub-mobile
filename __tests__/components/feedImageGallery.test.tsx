import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import FeedImageGallery from '../../components/Home/FeedImageGallery';

jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
const aspects: Record<string, number> = {};
jest.mock('../../components/common/SmartImage', () => ({
  warmFeedImage: jest.fn(),
  measureImageAspect: jest.fn((uri: string) => Promise.resolve(({ a: 2.4, b: 2.2, c: 2.1, d: 2.3 } as Record<string, number>)[uri])),
}));
jest.mock('../../hooks/useImageAspect', () => ({
  knownImageAspect: (uri: string) => aspects[uri],
  rememberImageAspect: (uri: string, ratio: number) => { aspects[uri] = ratio; },
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: unknown }) => require('react').createElement('GestureDetector', null, children),
}));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ isMinimal: false }) }));
jest.mock('../../components/Home/feedBleed', () => ({ useFeedBleed: () => null }));
jest.mock('../../hooks/useDataSaver', () => ({ useDataSaver: () => ({ liteMode: false }) }));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView',
  useWindowDimensions: () => ({ width: 400, height: 900 }),
  StyleSheet: { flatten: (style: unknown) => style },
}));
jest.mock('../../components/Home/ContainedFeedImage', () => ({
  __esModule: true,
  default: ({ uri, drawBitmap, aspect, fillHeight }: { uri: string; drawBitmap: boolean; aspect?: number; fillHeight?: number }) => drawBitmap
    ? require('react').createElement(require('react-native').View, { testID: uri, aspect, fillHeight }) : null,
}));

it('draws ahead, keeps photos already drawn on the way back, releases far ones, and retains every slide', () => {
  const images = ['a', 'b', 'c', 'd', 'e', 'f'];
  const screen = render(<FeedImageGallery images={images} width={300} fallbackWidth={300}
    active prioritizeMedia={false} onLayout={jest.fn()} onImagePress={jest.fn()} onReaction={jest.fn()} />);
  fireEvent(screen.getByTestId('feed-image-gallery'), 'layout', { nativeEvent: { layout: { width: 300 } } });
  for (let index = 0; index < images.length; index++) {
    fireEvent(screen.getByTestId(`feed-gallery-slide-${index}`), 'layout', { nativeEvent: { layout: { x: index * 308, width: 300 } } });
  }
  const drawn = () => images.filter(uri => screen.queryByTestId(uri));
  expect(drawn()).toEqual(['a', 'b', 'c']);
  fireEvent.scroll(screen.getByTestId('feed-image-gallery'), { nativeEvent: { contentOffset: { x: 700 } } });
  expect(drawn()).toEqual(['a', 'b', 'c', 'd', 'e']);
  fireEvent.scroll(screen.getByTestId('feed-image-gallery'), { nativeEvent: { contentOffset: { x: 1540 } } });
  expect(drawn()).toEqual(['b', 'c', 'd', 'e', 'f']);
  expect(screen.getByTestId('feed-gallery-slide-0')).toBeTruthy();
  fireEvent.scroll(screen.getByTestId('feed-image-gallery'), { nativeEvent: { contentOffset: { x: 924 } } });
  expect(drawn()).toEqual(['b', 'c', 'd', 'e', 'f']);
});

it('sizes the strip to the tallest measured photo, never to a guess for an unloaded one', async () => {
  const screen = render(<FeedImageGallery images={['a', 'b', 'c']} width={300} fallbackWidth={300}
    active prioritizeMedia={false} onLayout={jest.fn()} onImagePress={jest.fn()} onReaction={jest.fn()} />);
  // Every photo is measured up front, the drawn ones and the one not drawn yet.
  const { findByTestId } = screen;
  await findByTestId('feed-image-gallery-frame');
  await new Promise(resolve => setTimeout(resolve, 0));
  // Tallest of the three is c (2.1:1): 300 / 2.1.
  const slide = screen.getByTestId('feed-gallery-slide-2');
  expect(slide.props.style.height).toBeCloseTo(300 / 2.1);
  expect(screen.getByTestId('feed-gallery-slide-0').props.style.height).toBeCloseTo(300 / 2.1);
  expect(screen.getByTestId('a').props.aspect).toBe(2.4);
});

it('keeps a single photo and the post page unframed', () => {
  const single = render(<FeedImageGallery images={['a']} width={300} fallbackWidth={300}
    active prioritizeMedia={false} onLayout={jest.fn()} onImagePress={jest.fn()} onReaction={jest.fn()} />);
  expect(single.queryByTestId('feed-image-gallery-frame')).toBeNull();
  const page = render(<FeedImageGallery images={['a', 'b']} width={300} fallbackWidth={300} postPage
    active prioritizeMedia={false} onLayout={jest.fn()} onImagePress={jest.fn()} onReaction={jest.fn()} />);
  expect(page.queryByTestId('feed-image-gallery-frame')).toBeNull();
});

it('puts the pager scroll guard on the ScrollView itself, inside the frame', () => {
  const screen = render(<FeedImageGallery images={['a', 'b']} width={300} fallbackWidth={300} scrollGesture={{} as any}
    active prioritizeMedia={false} onLayout={jest.fn()} onImagePress={jest.fn()} onReaction={jest.fn()} />);
  const scroller = screen.getByTestId('feed-image-gallery');
  expect(scroller.parent?.type).toBe('GestureDetector');
});

it('stretches shorter photos to fill the frame', async () => {
  const screen = render(<FeedImageGallery images={['a', 'c']} width={300} fallbackWidth={300}
    active prioritizeMedia={false} onLayout={jest.fn()} onImagePress={jest.fn()} onReaction={jest.fn()} />);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(screen.getByTestId('a').props.fillHeight).toBeCloseTo(300 / 2.1);
});
