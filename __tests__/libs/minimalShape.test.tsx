import React from 'react';
import { View } from 'react-native';
import { render } from '@testing-library/react-native';
import { setSquaring, setThemePass, squareStyle, squareProps, routeProps, isVeiled, isPageFill, SQUARE } from '../../libs/jsx/shape';

// Same stub the other render tests use: the real styling runtime needs a
// device. What is under test is the pass in front of it.
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View',
  Modal: 'Modal',
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

  it('veils class-painted pages under a canvas theme, and leaves their own fills alone', () => {
    const veil = 'rgba(4,4,7,0.6)';
    setThemePass(false, veil, true);
    expect(squareProps({ className: 'flex-1 bg-theme-neutrals-900' }).style).toEqual({ backgroundColor: veil });
    const pad = { padding: 4 };
    expect(squareProps({ className: 'bg-theme-background', style: pad }).style).toEqual([pad, { backgroundColor: veil }]);
    const own = { backgroundColor: '#27272a' };
    expect(squareProps({ className: 'bg-zinc-950', style: own }).style).toBe(own);
    const tinted = { className: 'bg-theme-neutrals-900/60' };
    expect(squareProps(tinted)).toBe(tinted);
    // Without the class flag (minimal), classes keep their own colour.
    setThemePass(false, '#000');
    const minimal = { className: 'bg-theme-neutrals-900' };
    expect(squareProps(minimal)).toBe(minimal);
    setThemePass(false, null);
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

describe('canvas theme pages and floating surfaces', () => {
  const veil = 'rgba(10,8,18,0.6)';
  const solid = '#0A0812';
  beforeEach(() => setThemePass(false, veil, true, solid));
  afterEach(() => setThemePass(false, null));

  const bg = (el: { props: { style?: unknown } }) =>
    Object.assign({}, ...([] as any[]).concat(el.props.style ?? []).flat(3)).backgroundColor;

  it('veils a page but keeps a sheet inside a Modal solid, for class and inline fills alike', () => {
    const { Modal } = require('react-native');
    const { getByTestId } = render(
      <View>
        <View testID="page" className="flex-1 bg-theme-neutrals-900" />
        <Modal>
          <View testID="sheet-class" className="bg-theme-neutrals-900" />
          <View testID="sheet-inline" style={{ backgroundColor: '#0C0C0E' }} />
        </Modal>
      </View>,
    );
    expect(bg(getByTestId('page'))).toBe(veil);
    expect(bg(getByTestId('sheet-class'))).toBe(solid);
    expect(bg(getByTestId('sheet-inline'))).toBe(solid);
  });

  it('keeps a sheet solid when the screen that opens it creates its contents', () => {
    const { Modal } = require('react-native');
    const Sheet = ({ children }: { children: React.ReactNode }) => <Modal>{children}</Modal>;
    const { getByTestId } = render(
      <Sheet>
        <View testID="panel" style={{ backgroundColor: '#0C0C0E', borderRadius: 16 }} />
      </Sheet>,
    );
    expect(bg(getByTestId('panel'))).toBe(solid);
  });

  it('keeps pinned bars solid on a page', () => {
    expect(isPageFill({ className: 'absolute bottom-0 bg-theme-neutrals-900' })).toBe(false);
    expect(squareProps({ className: 'absolute bottom-0 bg-theme-neutrals-900' }).style).toEqual({ backgroundColor: solid });
    const pinned = { position: 'absolute', backgroundColor: '#010305' };
    expect(squareStyle(pinned)).toEqual([pinned, { backgroundColor: solid }]);
  });

  it('only splits pages from surfaces while a canvas theme veils its pages', () => {
    expect(isVeiled()).toBe(true);
    setThemePass(true, '#000');
    expect(isVeiled()).toBe(false);
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
