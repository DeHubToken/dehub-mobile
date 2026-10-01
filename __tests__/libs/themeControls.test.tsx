const { createElement } = jest.requireActual('react') as typeof import('react');
import { getThemeSkin } from '../../theme/skins';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setControlMaterial, controlProps } = require('../../libs/jsx/controls');

const flatten = (style: any): any => Array.isArray(style)
  ? Object.assign({}, ...style.map(flatten)) : style ?? {};
const useSkin = (theme: Parameters<typeof getThemeSkin>[0]) => {
  const skin = getThemeSkin(theme)!;
  setControlMaterial({ surface: skin.centre, foreground: skin.centreIcon,
    ownedSurfaces: [skin.card, skin.strip, skin.stripActive, skin.barFill, skin.barBorder] });
  return skin;
};
afterEach(() => setControlMaterial(null));

it('keeps existing theme cards and selected navigation surfaces intact', () => {
  const skin = useSkin('hazy');
  for (const surface of [skin.card, skin.strip, skin.stripActive]) {
    const props = { onPress: jest.fn(), style: [surface, { width: 80 }],
      children: createElement('Text', { style: { color: skin.tabIcon } }, 'Menu') };
    expect(controlProps(props)).toBe(props);
  }
});

it('themes inline neutral actions and their dark labels without changing the action', () => {
  const skin = useSkin('osaka');
  const action = jest.fn();
  const props = { onPress: action, style: { backgroundColor: '#F4F4F5', height: 44 },
    children: createElement('Text', { style: { color: '#09090B', fontSize: 14 } }, 'Continue') };
  const result = controlProps(props);
  expect(flatten(result.style)).toMatchObject({ ...skin.centre, height: 44 });
  expect(result.onPress).toBe(action);
  expect(flatten(result.children.props.style).color).toBe(skin.centreIcon);
});

it('themes neutral utility fills and labels', () => {
  const skin = useSkin('hacker');
  const result = controlProps({ onPress: jest.fn(), className: 'h-10 bg-white rounded-xl',
    children: createElement('Text', { className: 'text-black font-semibold' }, 'Save') });
  expect(flatten(result.style)).toMatchObject(skin.centre);
  expect(result.children.props.className).toContain('text-white');
  expect(result.children.props.className).toContain('font-semibold');
});

it('preserves bare actions, progress fills and semantic coloured actions', () => {
  useSkin('hazy');
  for (const props of [
    { onPress: jest.fn(), style: { backgroundColor: 'transparent' } },
    { onPress: jest.fn(), style: { backgroundColor: '#EF4444' } },
    { onPress: jest.fn(), style: () => ({ backgroundColor: '#EF4444' }) },
    { style: { backgroundColor: '#FFFFFF', width: 100 } },
    { onPress: jest.fn(), className: 'hover:bg-white/10' },
  ]) {
    const action = { ...props, children: 'Action' };
    expect(controlProps(action)).toBe(action);
  }
});

it('preserves press feedback and refreshes cached styles on a theme switch', () => {
  const style = { backgroundColor: '#FFFFFF', opacity: 1 };
  useSkin('hazy');
  const hazy = controlProps({ onPress: jest.fn(), style, children: 'Action' });
  const jungle = useSkin('jungle');
  const next = controlProps({ onPress: jest.fn(), style, children: 'Action' });
  expect(flatten(next.style)).toMatchObject(jungle.centre);
  expect(flatten(next.style).backgroundColor).not.toBe(flatten(hazy.style).backgroundColor);
  const pressed = controlProps({ onPress: jest.fn(), children: 'Action', style: ({ pressed }: any) => [style, { opacity: pressed ? .5 : 1 }] });
  expect(flatten(pressed.style({ pressed: true }))).toMatchObject({ ...jungle.centre, opacity: .5 });
});

it('keeps colour swatches and content previews accurate', () => {
  useSkin('hazy');
  for (const props of [
    { onPress: jest.fn(), accessibilityRole: 'button', style: { backgroundColor: '#FFFFFF', width: 30, height: 30 } },
    { onPress: jest.fn(), style: { backgroundColor: '#FFFFFF', aspectRatio: 1.4 }, children: 'Preview' },
  ]) expect(controlProps(props)).toBe(props);
});

it('keeps a single child single, so one-child wrappers still render', () => {
  const React = jest.requireActual('react') as typeof import('react');
  useSkin('hazy');
  const gallery = createElement('View', { style: { backgroundColor: '#000' } });
  const detector = createElement('GestureDetector', null, gallery);
  const result = controlProps({ onPress: jest.fn(), style: { backgroundColor: '#000000' },
    children: createElement('View', null, createElement('View', null, detector)) });
  const outer = result.children;
  expect(Array.isArray(outer)).toBe(false);
  const painted = outer.props.children.props.children;
  expect(painted.type).toBe('GestureDetector');
  expect(() => React.Children.only(painted.props.children)).not.toThrow();
});

it('still paints every label in a row of children', () => {
  const skin = useSkin('osaka');
  const result = controlProps({ onPress: jest.fn(), style: { backgroundColor: '#F4F4F5' },
    children: [createElement('Text', { key: 'a', style: { color: '#09090B' } }, 'A'),
      createElement('Text', { key: 'b', style: { color: '#09090B' } }, 'B')] });
  expect(result.children).toHaveLength(2);
  for (const label of result.children) expect(flatten(label.props.style).color).toBe(skin.centreIcon);
});
