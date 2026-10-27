import { Pressable, TouchableOpacity } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pressProps } = require('../../libs/jsx/press');

const onPress = () => {};

describe('pressed feedback', () => {
  it('takes active: off a TouchableOpacity and keeps its opacity feedback', () => {
    const props = pressProps(TouchableOpacity, { onPress, className: 'px-3 active:opacity-70 rounded-xl' });
    expect(props.className).toBe('px-3 rounded-xl');
    expect(props.activeOpacity).toBe(0.7);
  });

  it('drops an active: fill on a TouchableOpacity rather than let it stick', () => {
    const props = pressProps(TouchableOpacity, { onPress, activeOpacity: 0.7, className: 'mx-3 active:bg-white/10' });
    expect(props.className).toBe('mx-3');
    expect(props.activeOpacity).toBe(0.7);
  });

  it('gives a Pressable the same look from its own pressed state', () => {
    const props = pressProps(Pressable, { onPress, style: { padding: 4 }, className: 'border active:bg-white/10' });
    expect(props.className).toBe('border');
    expect(props.style({ pressed: false })).toEqual({ padding: 4 });
    expect(props.style({ pressed: true })).toEqual([{ padding: 4 }, { backgroundColor: 'rgba(255,255,255,0.1)' }]);
  });

  it('leaves non-pressables alone', () => {
    const props = { className: 'active:opacity-70' };
    expect(pressProps('View', props)).toBe(props);
  });
});
