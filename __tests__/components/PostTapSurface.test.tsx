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

  function setup() {
    const open = jest.fn();
    const react = jest.fn();
    const view = render(<PostTapSurface onPress={open} onReaction={react}><Text>Post</Text></PostTapSurface>);
    const surface = view.UNSAFE_getByType(Pressable);
    const event = (x = 20) => ({ nativeEvent: { pageX: x, pageY: 20 }, stopPropagation: jest.fn() });
    const tap = () => { fireEvent(surface, 'touchStart', event()); fireEvent.press(surface, event()); };
    return { ...view, open, react, surface, event, tap };
  }

  it('opens an image after one tap, without reacting', () => {
    const s = setup(); s.tap();
    expect(s.open).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(360));
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
    fireEvent.press(s.surface, s.event(100));
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
