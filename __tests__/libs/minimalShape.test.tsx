import React from 'react';
import { View } from 'react-native';
import { render } from '@testing-library/react-native';
import { setSquaring, squareStyle, squareProps, SQUARE } from '../../libs/jsx/shape';
import { ThemeShapeContext } from '../../libs/jsx/themed-shape';

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
    const { getByTestId } = render(<ThemeShapeContext.Provider value={true}><View testID="box" style={{ borderRadius: 16, width: 10 }} /></ThemeShapeContext.Provider>);
    const flat = Object.assign({}, ...([] as any[]).concat(getByTestId('box').props.style).flat(3));
    expect(flat.borderRadius).toBe(0);
    expect(flat.width).toBe(10);
  });

  it('restores system shapes through memoised screens without remounting or losing refs', () => {
    let mounts = 0;
    let unmounts = 0;
    const ref = React.createRef<any>();
    const Screen = React.memo(function Screen() {
      const [draft] = React.useState('unsent draft');
      React.useEffect(() => {
        mounts++;
        return () => { unmounts++; };
      }, []);
      return <View ref={ref} testID="screen" accessibilityLabel={draft} style={{ borderRadius: 16, backgroundColor: '#010305' }} />;
    });
    const app = (minimal: boolean) => <ThemeShapeContext.Provider value={minimal}><Screen /></ThemeShapeContext.Provider>;
    const { getByTestId, rerender } = render(app(false), { createNodeMock: () => ({ id: 'screen' }) });
    const node = ref.current;
    expect(node).not.toBeNull();
    for (const minimal of [true, false, true, false]) {
      rerender(app(minimal));
      const screen = getByTestId('screen');
      const flat = Object.assign({}, ...([] as any[]).concat(screen.props.style).flat(3));
      expect(flat.borderRadius).toBe(minimal ? 0 : 16);
      expect(flat.backgroundColor).toBe(minimal ? '#000' : '#010305');
      expect(screen.props.accessibilityLabel).toBe('unsent draft');
      expect(ref.current).toBe(node);
    }
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);
  });
});
