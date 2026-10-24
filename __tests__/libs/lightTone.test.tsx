import React from 'react';
import { Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';

// The real styling runtime needs a device; what is under test is the pass.
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native-css-interop', () => ({ createInteropElement: jest.requireActual('react').createElement }));
jest.mock('react-native', () => ({ Text: 'Text', View: 'View', Modal: 'Modal', StyleSheet: { flatten: (s: unknown) => s } }));

const { setLightTone, toneColor, tone, ToneFill } = require('../../libs/jsx/tone');

afterEach(() => setLightTone(false));

it('turns greys around and leaves colours, media black and scrims alone', () => {
  expect(toneColor('#FFFFFF', false)).toBe('hsla(0,0%,4.3%,1)');
  expect(toneColor('rgba(255,255,255,0.1)', false)).toBe('hsla(0,0%,4.3%,0.1)');
  expect(toneColor('#18181B', true)).toBe('hsla(0,0%,94.5%,1)');
  expect(toneColor('#010305', true)).toBe('hsla(0,0%,100%,1)');
  expect(toneColor('#000', true)).toBe('#000');
  expect(toneColor('rgba(0,0,0,0.5)', true)).toBe('rgba(0,0,0,0.5)');
  expect(toneColor('#ef4444', false)).toBe('#ef4444');
  expect(toneColor('#000000', false)).toBe('hsla(0,0%,100%,1)');
  // What the pass produced is never turned back when it is handed on.
  expect(toneColor('hsla(0,0%,4.3%,1)', false)).toBe('hsla(0,0%,4.3%,1)');
});

it('holds light text to AAA on white', () => {
  // Plain white text is ink either way.
  expect(toneColor('#FFFFFF', false, true)).toBe('hsla(0,0%,4.3%,1)');
  // Faint dark-theme labels would invert to ~3:1; text caps at #565656 (7.3:1).
  expect(toneColor('#71717A', false, true)).toBe('hsla(0,0%,29%,1)');
  expect(toneColor('rgba(255,255,255,0.5)', false, true)).toBe('hsla(0,0%,29%,1)');
  expect(toneColor('rgba(255,255,255,0.9)', false, true)).toBe('hsla(0,0%,13.9%,1)');
  // Cool slate muted copy counts as grey for text, not for fills.
  expect(toneColor('#919ca9', false, true)).toBe('hsla(0,0%,29%,1)');
  expect(toneColor('#919ca9', true)).toBe('#919ca9');
  // A dark label on a white key becomes the white label on an ink key.
  expect(toneColor('#000000', false, true)).toBe('hsla(0,0%,100%,1)');
});

it('does nothing while System Light is off', () => {
  const props = { style: { color: '#fff' } };
  expect(tone(Text, props)).toEqual([Text, props]);
});

it('flips inline greys, except inside a dark surface', () => {
  setLightTone(true);
  const [type, props] = tone(Text, { style: { color: '#fff' }, children: 'hi' });
  expect(type).toBe(ToneFill);
  let tree: any;
  act(() => { tree = create(React.createElement(type, props)); });
  expect(tree.root.findByType(Text as any).props.style).toEqual([{ color: '#fff' }, { color: 'hsla(0,0%,4.3%,1)' }]);

  const [darkType, darkProps] = tone(View, { className: 'dark-surface', children: React.createElement(type, props) });
  act(() => { tree = create(React.createElement(darkType, darkProps)); });
  expect(tree.root.findByType(Text as any).props.style).toEqual({ color: '#fff' });
});

it('keeps LIGHT_PAGE_FILL white, where a plain white fill turns to ink', () => {
  const { LIGHT_PAGE_FILL } = jest.requireActual('../../theme/colors');
  // Navigator options reach a View through react-native-screens' source, so
  // the pass sees them: '#FFFFFF' there painted iPhone pages black.
  expect(toneColor('#FFFFFF', true)).toBe('hsla(0,0%,4.3%,1)');
  expect(toneColor(LIGHT_PAGE_FILL, true)).toBe(LIGHT_PAGE_FILL);
});
