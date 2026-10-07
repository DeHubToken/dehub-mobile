import { Text, TextInput, View } from 'react-native';
jest.mock('react-native', () => ({ Text: 'Text', TextInput: 'TextInput', View: 'View' }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readableTextProps } = require('../../libs/jsx/readability');
const flatten = (style: any): any => Array.isArray(style)
  ? Object.assign({}, ...style.map(flatten)) : style ?? {};

it('brightens native metadata while retaining the final style and disabled opacity', () => {
  const props = { style: [{ color: '#A1A1AA', fontSize: 12 }, [{ opacity: .4, color: '#808089' }]] };
  const result = readableTextProps(Text, props);
  expect(flatten(result.style)).toEqual({ color: '#FFFFFF', fontSize: 12, opacity: .4 });
  expect(readableTextProps(Text, props).style).toBe(result.style);
});

it('brightens only complete neutral utility tokens and native placeholders', () => {
  const result = readableTextProps(TextInput, {
    className: 'text-zinc-600 text-xs bg-zinc-600 border-zinc-500 focus:text-red-400',
    placeholderTextColor: '#52525b',
  });
  expect(result.className).toBe('text-white text-xs bg-zinc-600 border-zinc-500 focus:text-red-400');
  expect(result.placeholderTextColor).toBe('#FFFFFF');
  expect(readableTextProps(Text, { className: 'text-white/50' }).className).toBe('text-white');
  expect(flatten(readableTextProps(Text, { style: { color: '#919CA9' } }).style).color).toBe('#FFFFFF');
});

it('preserves semantic colours, dark button labels, light fills and non-text props', () => {
  for (const style of [{ color: '#EF4444' }, { color: '#09090B' }, { color: '#808089', backgroundColor: '#FFFFFF' }]) {
    const props = { style };
    expect(readableTextProps(Text, props)).toBe(props);
  }
  const props = { style: { color: '#A1A1AA', backgroundColor: '#808089' }, className: 'text-zinc-500' };
  expect(readableTextProps(View, props)).toBe(props);
  const light = { className: 'bg-white text-zinc-500' };
  expect(readableTextProps(Text, light)).toBe(light);
});
