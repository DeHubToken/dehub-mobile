import React from 'react';
import { act, render } from '@testing-library/react-native';
import SmartImage from '../../components/common/SmartImage';

const mockStart = jest.fn(() => Promise.resolve());
const mockStop = jest.fn(() => Promise.resolve());
let mockOnLoad: ((event: any) => void) | undefined;
jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));

jest.mock('expo-image', () => {
  const React = require('react');
  return {
    Image: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ startAnimating: mockStart, stopAnimating: mockStop }));
      mockOnLoad = props.onLoad;
      return null;
    }),
  };
});

beforeEach(() => { mockStart.mockClear(); mockStop.mockClear(); });

it('pauses an already loaded GIF when hidden and resumes it when visible', () => {
  const onLoad = jest.fn();
  const { rerender } = render(<SmartImage source="animated.gif" autoplay={true} onLoad={onLoad} />);
  const event = { source: { isAnimated: true }, cacheType: 'disk' };
  act(() => mockOnLoad?.(event));
  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(onLoad).toHaveBeenCalledWith(event);
  rerender(<SmartImage source="animated.gif" autoplay={false} onLoad={onLoad} />);
  expect(mockStop).toHaveBeenCalledTimes(1);
  rerender(<SmartImage source="animated.gif" autoplay={true} onLoad={onLoad} />);
  expect(mockStart).toHaveBeenCalledTimes(2);
});

it('keeps a GIF loaded into a hidden row paused and skips static image commands', () => {
  const { rerender } = render(<SmartImage source="animated.gif" autoplay={false} />);
  act(() => mockOnLoad?.({ source: { isAnimated: true } }));
  expect(mockStop).toHaveBeenCalledTimes(1);
  act(() => mockOnLoad?.({ source: { isAnimated: false } }));
  rerender(<SmartImage source="still.jpg" autoplay={true} />);
  expect(mockStart).not.toHaveBeenCalled();
  expect(mockStop).toHaveBeenCalledTimes(1);
});
