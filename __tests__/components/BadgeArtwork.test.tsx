import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import BadgeArtwork from '../../components/common/BadgeArtwork';
import { openBadgeShowcase } from '../../libs/badgeShowcase';
import { useReducedMotion } from 'react-native-reanimated';

jest.mock('../../libs/badgeShowcase', () => ({
  tierForBadgeImage: () => 'Octopus', openBadgeShowcase: jest.fn(),
}));
jest.mock('../../libs/badgeHoverArt', () => ({
  badgeHoverArt: () => ({ poster: 101, animation: 102 }),
}));
jest.mock('expo-image', () => ({ Image: require('react-native').Image }));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: jest.fn(() => false) }));

beforeEach(() => {
  jest.clearAllMocks();
  (useReducedMotion as jest.Mock).mockReturnValue(false);
});

describe('holder badge interaction', () => {
  it('keeps idle badges still and only mounts playback during hover or touch', () => {
    const { getByTestId, queryByTestId } = render(<BadgeArtwork source={1} style={{ width: 16, height: 16 }} />);
    const badge = getByTestId('holder-badge');
    expect(getByTestId('holder-badge-poster').props.source).toBe(101);
    expect(queryByTestId('holder-badge-motion')).toBeNull();
    fireEvent(badge, 'hoverIn');
    expect(getByTestId('holder-badge-motion').props.source).toBe(102);
    fireEvent(badge, 'hoverOut');
    expect(queryByTestId('holder-badge-motion')).toBeNull();
    fireEvent(badge, 'pressIn');
    expect(getByTestId('holder-badge-motion')).toBeTruthy();
    fireEvent(badge, 'pressOut');
    expect(queryByTestId('holder-badge-motion')).toBeNull();
  });

  it('preserves the existing showcase action without passing the press to the surrounding card', () => {
    const { getByTestId } = render(<BadgeArtwork source={1} />);
    const stopPropagation = jest.fn();
    fireEvent.press(getByTestId('holder-badge'), { stopPropagation });
    expect(stopPropagation).toHaveBeenCalled();
    expect(openBadgeShowcase).toHaveBeenCalledWith('Octopus', null);
  });

  it('respects reduced motion and recovers from a failed animation', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    const { getByTestId, queryByTestId, rerender } = render(<BadgeArtwork source={1} />);
    fireEvent(getByTestId('holder-badge'), 'hoverIn');
    expect(queryByTestId('holder-badge-motion')).toBeNull();
    (useReducedMotion as jest.Mock).mockReturnValue(false);
    rerender(<BadgeArtwork source={1} />);
    fireEvent(getByTestId('holder-badge-motion'), 'error');
    expect(queryByTestId('holder-badge-motion')).toBeNull();
    expect(getByTestId('holder-badge-poster')).toBeTruthy();
  });
});
