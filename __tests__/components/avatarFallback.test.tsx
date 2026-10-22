import React from 'react';
import { act, render } from '@testing-library/react-native';
import Avatar from '../../components/common/Avatar';

jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { flatten: (s: unknown) => s },
}));
jest.mock('../../components/common/LiveRipple', () => 'LiveRipple');
jest.mock('../../components/common/SmartImage', () => 'SmartImage');

const images = (view: ReturnType<typeof render>) =>
  view.UNSAFE_root.findAll((n) => (n.type as unknown) === 'SmartImage');

// A stage seat stores the picture the person had when they sat down. When that
// file fails, the wallet's own picture is tried before the initial is left on
// its own, and a recycled row showing someone else starts from the top again.
describe('Avatar fallback ladder', () => {
  it('moves from the stored picture to the fallback, then to the initial', () => {
    const view = render(<Avatar uri="https://cdn/stored.webp" fallbackUri="https://cdn/wallet.jpg" name="mal" />);
    expect(images(view)[0].props.source).toEqual({ uri: 'https://cdn/stored.webp' });
    act(() => images(view)[0].props.onError());
    expect(images(view)[0].props.source).toEqual({ uri: 'https://cdn/wallet.jpg' });
    act(() => images(view)[0].props.onError());
    expect(images(view)).toHaveLength(0);
    expect(view.getByText('M')).toBeTruthy();
  });

  it('starts again from the top when the row is handed another person', () => {
    const view = render(<Avatar uri="https://cdn/a.webp" fallbackUri="https://cdn/a.jpg" name="a" />);
    act(() => images(view)[0].props.onError());
    act(() => images(view)[0].props.onError());
    expect(images(view)).toHaveLength(0);
    view.rerender(<Avatar uri="https://cdn/b.webp" fallbackUri="https://cdn/b.jpg" name="b" />);
    expect(images(view)[0].props.source).toEqual({ uri: 'https://cdn/b.webp' });
  });

  it('skips the default-avatar sentinel and repeats', () => {
    const view = render(<Avatar uri="default-avatar" fallbackUri="https://cdn/wallet.jpg" name="x" />);
    expect(images(view)[0].props.source).toEqual({ uri: 'https://cdn/wallet.jpg' });
    const same = render(<Avatar uri="https://cdn/one.jpg" fallbackUri="https://cdn/one.jpg" name="y" />);
    act(() => images(same)[0].props.onError());
    expect(images(same)).toHaveLength(0);
  });
});
