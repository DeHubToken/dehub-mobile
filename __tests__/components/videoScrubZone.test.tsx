import React from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { VideoScrubButton, VideoScrubZone } from '../../components/Home/VideoScrubZone';

jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable',
  StyleSheet: {
    create: (styles: unknown) => styles,
    flatten: (styles: unknown) => Array.isArray(styles) ? Object.assign({}, ...styles) : styles,
    absoluteFill: {},
  },
  Animated: { View: 'AnimatedView', Value: class { setValue = jest.fn(); } },
}));

let mockScrubOptions: any;
jest.mock('../../hooks/useScrubGesture', () => ({
  useScrubGesture: (options: any) => {
    mockScrubOptions = options;
    return { gesture: {}, onLayout: jest.fn() };
  },
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: any) => children,
}));
jest.mock('../../hooks/useFeedScrubBoundary', () => ({
  FeedScrubContext: require('react').createContext(null),
  SCRUB_HIT_HEIGHT: 80,
}));

function setup(showControls = true) {
  const onStart = jest.fn(), onScrub = jest.fn(), onCommit = jest.fn(), onCancel = jest.fn(), buttonPress = jest.fn();
  const view = render(<VideoScrubZone enabled opacity={new Animated.Value(1)} showControls={showControls} label="Progress" progress={0} onStart={onStart} onScrub={onScrub} onCommit={onCommit} onCancel={onCancel}>
    <VideoScrubButton style={{ width: 32, height: 32 }} onPress={buttonPress} accessibilityRole="button" accessibilityLabel="Play"><Text>Play</Text></VideoScrubButton>
  </VideoScrubZone>);
  const zone = view.getByTestId('video-scrub-zone');
  const event = (x = 20, y = 400) => ({ nativeEvent: { pageX: x, pageY: y, locationX: x }, stopPropagation: jest.fn() });
  return { ...view, zone, event, onStart, onCommit, buttonPress };
}

describe('video scrub zone', () => {
  it('enlarges only the invisible target while keeping the rail and button row anchored', () => {
    const s = setup();
    expect(s.zone.props.style).toEqual({ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 });
    expect(mockScrubOptions.immediateBottom).toBe(80);
    const layers = s.UNSAFE_getAllByType(Animated.View).map(layer => StyleSheet.flatten(layer.props.style));
    expect(layers).toEqual(expect.arrayContaining([
      expect.objectContaining({ bottom: 0, height: 3 }),
      expect.objectContaining({ bottom: 14 }),
    ]));
    const down = s.event();
    fireEvent(s.zone, 'touchStart', down);
    expect(down.stopPropagation).toHaveBeenCalled();
    const up = s.event(190, 440);
    fireEvent(s.zone, 'touchEnd', up);
    expect(up.stopPropagation).toHaveBeenCalled();
  });
  it('consumes a scrub release instead of pressing the button where it started', () => {
    const s = setup();
    fireEvent(s.zone, 'touchStart', s.event());
    mockScrubOptions.onScrubStart();
    mockScrubOptions.onCommit(0.75);
    fireEvent.press(s.getByLabelText('Play'), s.event(150));
    expect(s.onCommit).toHaveBeenCalledWith(0.75);
    expect(s.buttonPress).not.toHaveBeenCalled();
    fireEvent(s.zone, 'touchStart', s.event());
    fireEvent.press(s.getByLabelText('Play'), s.event());
    expect(s.buttonPress).toHaveBeenCalledTimes(1);
  });

  it('keeps tap seeking available while buttons are hidden', () => {
    const s = setup(false);
    fireEvent(s.zone, 'layout', { nativeEvent: { layout: { width: 200 } } });
    fireEvent(s.zone, 'touchStart', s.event());
    fireEvent.press(s.getByTestId('video-scrub-tap'), s.event(150));
    expect(s.onStart).toHaveBeenCalledTimes(1);
    expect(s.onCommit).toHaveBeenCalledWith(0.75);
  });

  it('does not turn moved touches into extra tap seeks or button presses', () => {
    const s = setup();
    fireEvent(s.zone, 'touchStart', s.event());
    fireEvent(s.zone, 'touchMove', s.event(20, 420));
    fireEvent.press(s.getByTestId('video-scrub-tap'), s.event());
    fireEvent.press(s.getByLabelText('Play'), s.event());
    expect(s.onCommit).not.toHaveBeenCalled();
    expect(s.buttonPress).not.toHaveBeenCalled();
  });
});
