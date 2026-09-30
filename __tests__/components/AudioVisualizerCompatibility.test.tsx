let mockHasSkia = false;
let mockSkiaFails = false;
const mockSkiaImport = jest.fn();
const mockAdapterImport = jest.fn();
const mockCreatePicture = jest.fn(() => ({}));

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View',
  TurboModuleRegistry: { get: () => mockHasSkia ? {} : null },
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'AnimatedView' },
  Easing: { linear: (v: number) => v, quad: (v: number) => v, out: (f: unknown) => f },
  cancelAnimation: jest.fn(),
  runOnJS: (f: unknown) => f,
  useAnimatedReaction: jest.fn(),
  useAnimatedStyle: (f: () => unknown) => f(),
  useSharedValue: (value: number) => ({ value }),
  withRepeat: (value: number) => value,
  withTiming: (value: number) => value,
}));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ theme: 'system' }) }));
jest.mock('@shopify/react-native-skia', () => {
  mockSkiaImport();
  if (!mockHasSkia || mockSkiaFails) throw new Error('RNSkiaModule could not be found');
  return { Canvas: 'SkiaCanvas', Picture: 'SkiaPicture', createPicture: mockCreatePicture };
});
jest.mock('../../components/Home/skia-ctx2d', () => {
  mockAdapterImport();
  if (!mockHasSkia) throw new Error('The adapter imported Skia on an old binary');
  return { SkiaCtx2D: class {} };
});

describe.each([
  { name: 'older binary without Skia', hasSkia: false, fails: false },
  { name: 'binary with Skia', hasSkia: true, fails: false },
  { name: 'Skia fails to initialize', hasSkia: true, fails: true },
])('$name', ({ hasSkia, fails }) => {
  it('renders extra styles safely and preserves the waveform props when falling back', () => {
    jest.resetModules();
    jest.clearAllMocks();
    mockHasSkia = hasSkia;
    mockSkiaFails = fails;
    const React = require('react');
    const { act, create } = require('react-test-renderer');
    const { AudioVisualizer, StaticWaveform } = require('../../components/Home/AudioVisualizers');
    const { EXTRA_STYLES } = require('../../components/Home/visualizer-extra');
    const position = { value: 0.4 };
    const onLayout = jest.fn();
    let tree: import('react-test-renderer').ReactTestRenderer;

    for (const { value: style } of EXTRA_STYLES) {
      for (const isPlaying of [false, true]) {
        act(() => {
          tree = create(React.createElement(AudioVisualizer, {
            style, seed: 'audio-post', position, isPlaying, hue: 210, height: 180, onLayout,
          }));
        });
        expect(tree!.toJSON()).not.toBeNull();
        if (!hasSkia || fails) {
          const waveform = tree!.root.findByType(StaticWaveform.type);
          expect(waveform.props).toMatchObject({
            seed: 'audio-post', position, isPlaying, hue: 210, height: 180, onLayout,
          });
        } else if (!isPlaying) {
          act(() => tree!.root.findByType('View').props.onLayout({ nativeEvent: { layout: { width: 320 } } }));
          expect(tree!.root.findByType('SkiaCanvas')).toBeDefined();
          expect(mockCreatePicture).toHaveBeenCalled();
        }
        act(() => tree!.unmount());
      }
    }

    expect(mockSkiaImport).toHaveBeenCalledTimes(hasSkia ? 1 : 0);
    expect(mockAdapterImport).toHaveBeenCalledTimes(hasSkia && !fails ? 1 : 0);
  });
});
