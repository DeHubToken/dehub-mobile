import React from 'react';
import { View } from 'react-native';
import { render } from '@testing-library/react-native';
import { setSquaring, squareStyle, squareProps, SQUARE } from '../../libs/jsx/shape';

// Same stub the other render tests use: the real styling runtime needs a
// device. What is under test is the pass in front of it.
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View',
  StyleSheet: { flatten: (style: unknown) => style },
}));

describe('minimal theme shape pass', () => {
  afterEach(() => setSquaring(false));

  it('leaves every prop alone while minimal is off', () => {
    const props = { style: { borderRadius: 12 } };
    expect(squareProps(props)).toBe(props);
  });

  it('squares inline radii, including per-corner ones, when minimal is on', () => {
    setSquaring(true);
    const style = { borderRadius: 12, borderTopLeftRadius: 4, padding: 8 };
    expect(squareProps({ style }).style).toEqual([style, SQUARE]);
    expect(squareStyle([{ padding: 4 }, [{ borderBottomEndRadius: 6 }]])).toEqual([
      [{ padding: 4 }, [{ borderBottomEndRadius: 6 }]],
      SQUARE,
    ]);
  });

  it('does not touch styles that have no radius, so memoised children keep the same prop', () => {
    setSquaring(true);
    const style = { padding: 8, borderRadius: 0 };
    const props = { style };
    expect(squareProps(props)).toBe(props);
  });

  it('returns the same squared array for the same style object across renders', () => {
    setSquaring(true);
    const style = { borderRadius: 8 };
    expect(squareStyle(style)).toBe(squareStyle(style));
  });

  it('takes near-black page backgrounds to true black and leaves real fills alone', () => {
    setSquaring(true);
    expect(squareStyle({ flex: 1, backgroundColor: '#010305' })).toEqual([
      { flex: 1, backgroundColor: '#010305' },
      { backgroundColor: '#000' },
    ]);
    const button = { backgroundColor: '#27272a' };
    expect(squareStyle(button)).toBe(button);
    // A later entry that repaints the element wins, as it does on screen.
    const layered = [{ backgroundColor: '#0C0C0E' }, { backgroundColor: '#fff' }];
    expect(squareStyle(layered)).toBe(layered);
  });

  it('reaches elements rendered through the app JSX runtime', () => {
    setSquaring(true);
    const { getByTestId } = render(<View testID="box" style={{ borderRadius: 16, width: 10 }} />);
    const flat = Object.assign({}, ...([] as any[]).concat(getByTestId('box').props.style).flat(3));
    expect(flat.borderRadius).toBe(0);
    expect(flat.width).toBe(10);
  });
});
