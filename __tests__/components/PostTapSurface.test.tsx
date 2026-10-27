import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import PostTapSurface from '../../components/Home/PostTapSurface';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable',
  StyleSheet: { flatten: (style: unknown) => style },
}));

describe('text and image post gestures', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function setup(immediatePress = false) {
    const open = jest.fn();
    const react = jest.fn();
    const view = render(<PostTapSurface immediatePress={immediatePress} onPress={open} onReaction={react}><Text>Post</Text></PostTapSurface>);
    const surface = view.UNSAFE_getByType(Pressable);
    fireEvent(surface, 'layout', { nativeEvent: { layout: { width: 200, height: 200, x: 0, y: 0 } } });
    const event = (x = 100, y = 100) => ({ nativeEvent: { pageX: x, pageY: y, locationX: x, locationY: y }, stopPropagation: jest.fn() });
    const tap = () => { fireEvent(surface, 'touchStart', event()); fireEvent.press(surface, event()); };
    return { ...view, open, react, surface, event, tap };
  }

  it('opens the image after one central tap, without reacting', () => {
    const s = setup(); s.tap();
    expect(s.open).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(360));
    expect(s.open).toHaveBeenCalledTimes(1);
    expect(s.react).not.toHaveBeenCalled();
  });

  it('opens navigable captions on the first central tap without waiting for reaction arbitration', () => {
    const s = setup(true);
    s.tap();
    expect(s.open).toHaveBeenCalledTimes(1);
    expect(s.react).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1000));
    expect(s.open).toHaveBeenCalledTimes(1);
    expect(s.react).not.toHaveBeenCalled();
  });

  it('does not open an immediate caption after a scroll', () => {
    const s = setup(true);
    fireEvent(s.surface, 'touchStart', s.event());
    fireEvent.press(s.surface, s.event(180));
    expect(s.open).not.toHaveBeenCalled();
  });

  it('opens immediately outside the center without waiting for another tap', () => {
    const s = setup();
    fireEvent(s.surface, 'touchStart', s.event(20));
    fireEvent.press(s.surface, s.event(20));
    expect(s.open).toHaveBeenCalledTimes(1);
    expect(s.react).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1000));
    expect(s.open).toHaveBeenCalledTimes(1);
    expect(s.react).not.toHaveBeenCalled();
  });

  it('cancels a pending central gesture when the next tap opens outside it', () => {
    const s = setup(); s.tap();
    fireEvent(s.surface, 'touchStart', s.event(20));
    fireEvent.press(s.surface, s.event(20));
    expect(s.open).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(1000));
    expect(s.open).toHaveBeenCalledTimes(1);
    expect(s.react).not.toHaveBeenCalled();
  });

  it('double taps like without opening the image', () => {
    const s = setup(); s.tap();
    act(() => jest.advanceTimersByTime(100)); s.tap();
    expect(s.getByText('👍')).toBeTruthy();
    act(() => jest.advanceTimersByTime(360));
    expect(s.react).toHaveBeenCalledWith('like');
    expect(s.react).toHaveBeenCalledTimes(1);
    expect(s.open).not.toHaveBeenCalled();
  });

  it('triple taps send only love, never an intermediate like', () => {
    const s = setup(); s.tap(); s.tap(); s.tap();
    act(() => jest.advanceTimersByTime(1000));
    expect(s.react).toHaveBeenCalledTimes(1);
    expect(s.react).toHaveBeenCalledWith('love');
    expect(s.open).not.toHaveBeenCalled();
  });

  it('ignores a scroll even when no move event was delivered', () => {
    const s = setup();
    fireEvent(s.surface, 'touchStart', s.event());
    fireEvent.press(s.surface, s.event(180));
    act(() => jest.advanceTimersByTime(1000));
    expect(s.open).not.toHaveBeenCalled();
    expect(s.react).not.toHaveBeenCalled();
  });

  it('cancels a pending reaction when the card unmounts', () => {
    const s = setup(); s.tap(); s.tap(); s.unmount();
    act(() => jest.advanceTimersByTime(1000));
    expect(s.react).not.toHaveBeenCalled();
  });
});

describe('tap reactions float on the root layer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('hands a double tap to the root layer at the finger instead of drawing inside the post', () => {
    const { subscribeTapBursts } = require('../../libs/tap-reaction-layer');
    const bursts: unknown[] = [];
    const stop = subscribeTapBursts((b: unknown) => bursts.push(b));
    const view = render(<PostTapSurface onPress={jest.fn()} onReaction={jest.fn()}><Text>Post</Text></PostTapSurface>);
    const surface = view.UNSAFE_getByType(Pressable);
    fireEvent(surface, 'layout', { nativeEvent: { layout: { width: 200, height: 200, x: 0, y: 0 } } });
    const event = { nativeEvent: { pageX: 100, pageY: 90, locationX: 100, locationY: 90 }, stopPropagation: jest.fn() };
    fireEvent(surface, 'touchStart', event); fireEvent.press(surface, event);
    fireEvent(surface, 'touchStart', event); fireEvent.press(surface, event);
    expect(bursts).toEqual([{ reaction: 'like', x: 100, y: 90 }]);
    expect(view.queryByText('👍')).toBeNull();
    stop();
  });
});
