import React from 'react';
import { View } from 'react-native';
import { render } from '@testing-library/react-native';
import { setSquaring, setThemePass, squareStyle, squareProps, routeProps, SQUARE } from '../../libs/jsx/shape';

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

  it('gives a canvas theme its own page colour without squaring its corners', () => {
    setThemePass(false, '#0A0812');
    expect(squareStyle({ flex: 1, backgroundColor: '#010305' })).toEqual([
      { flex: 1, backgroundColor: '#010305' },
      { backgroundColor: '#0A0812' },
    ]);
    const rounded = { borderRadius: 12 };
    expect(squareProps({ style: rounded }).style).toBe(rounded);
  });

  it('squares and repaints together for War, and a theme switch drops cached results', () => {
    const style = { borderRadius: 12, backgroundColor: '#0c0c0e' };
    setSquaring(true);
    expect(squareStyle(style)).toEqual([style, { ...SQUARE, backgroundColor: '#000' }]);
    setThemePass(true, '#060A09');
    expect(squareStyle(style)).toEqual([style, { ...SQUARE, backgroundColor: '#060A09' }]);
    setThemePass(false, null);
    const props = { style };
    expect(squareProps(props)).toBe(props);
  });

  it('reaches elements rendered through the app JSX runtime', () => {
    setSquaring(true);
    const { getByTestId } = render(<View testID="box" style={{ borderRadius: 16, width: 10 }} />);
    const flat = Object.assign({}, ...([] as any[]).concat(getByTestId('box').props.style).flat(3));
    expect(flat.borderRadius).toBe(0);
    expect(flat.width).toBe(10);
  });

  it('squares what a pressed-state style function returns', () => {
    setSquaring(true);
    const pressable = ({ pressed }: { pressed: boolean }) => ({ borderRadius: 18, opacity: pressed ? 0.8 : 1 });
    const squared = squareProps({ style: pressable }).style as typeof pressable;
    expect(squared({ pressed: true })).toEqual([{ borderRadius: 18, opacity: 0.8 }, SQUARE]);
  });
});

describe('style functions and the NativeWind runtime', () => {
  it('sends a Pressable style function around css-interop, which would drop it', () => {
    const style = ({ pressed }: { pressed: boolean }) => ({ width: 36, opacity: pressed ? 0.8 : 1 });
    const routed = routeProps({ style, onPress: () => {} });
    expect(routed.cssInterop).toBe(false);
    expect(routed.style).toBe(style);
  });

  it('leaves object styles, className elements and explicit opt-ins alone', () => {
    const plain = { style: { width: 36 } };
    expect(routeProps(plain)).toBe(plain);
    const classed = { className: 'w-9', style: () => ({ width: 36 }) };
    expect(routeProps(classed)).toBe(classed);
    const explicit = { cssInterop: true, style: () => ({ width: 36 }) };
    expect(routeProps(explicit)).toBe(explicit);
    expect(routeProps(null)).toBe(null);
  });
});
