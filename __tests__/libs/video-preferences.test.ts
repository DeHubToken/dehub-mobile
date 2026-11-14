const mockValues = new Map<string, string>();
const mockRead = jest.fn((key: string) => Promise.resolve(mockValues.get(key) ?? null));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => mockRead(key),
    setItem: jest.fn((key: string, value: string) => {
      mockValues.set(key, value);
      return Promise.resolve();
    }),
  },
}));

function restart(): typeof import('../../libs/video-preferences') {
  let prefs!: typeof import('../../libs/video-preferences');
  jest.isolateModules(() => { prefs = require('../../libs/video-preferences'); });
  return prefs;
}

beforeEach(() => {
  mockValues.clear();
  mockRead.mockReset().mockImplementation(key => Promise.resolve(mockValues.get(key) ?? null));
});

it('defaults replay to off on a fresh install', async () => {
  const prefs = restart();
  expect(prefs.getIsLooping()).toBe(false);
  await prefs.warmVideoPreferences();
  expect(prefs.getIsLooping()).toBe(false);
});

it.each([true, false])('restores replay=%s after an app restart', async looping => {
  const prefs = restart();
  await prefs.warmVideoPreferences();
  prefs.setIsLooping(looping);
  const reopened = restart();
  await reopened.warmVideoPreferences();
  expect(reopened.getIsLooping()).toBe(looping);
});

it('keeps an off tap made before stored preferences finish loading', async () => {
  let finish!: (raw: string) => void;
  mockRead.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
  const prefs = restart();
  const loading = prefs.warmVideoPreferences();
  prefs.setIsLooping(false);
  finish(JSON.stringify({ isLooping: true, playbackRate: 1.5, rateScope: 2 }));
  await loading;
  expect(prefs.getIsLooping()).toBe(false);
  expect(prefs.getPlaybackRateFor()).toBe(1.5);
  const reopened = restart();
  await reopened.warmVideoPreferences();
  expect(reopened.getIsLooping()).toBe(false);
});

it('keeps a speed picked on one creator away from everyone else', async () => {
  const prefs = restart();
  await prefs.warmVideoPreferences();
  prefs.setPlaybackRate(2, '0xAbC');
  expect(prefs.getPlaybackRateFor('0xabc')).toBe(2);
  expect(prefs.getPlaybackRateFor('0xdef')).toBe(1);
  expect(prefs.getPlaybackRateFor()).toBe(1);
  const reopened = restart();
  await reopened.warmVideoPreferences();
  expect(reopened.getPlaybackRateFor('0xabc')).toBe(2);
  expect(reopened.getPlaybackRateFor('0xdef')).toBe(1);
});

it('puts a phone left at 2x everywhere back to normal speed, once', async () => {
  mockValues.set('video-preferences', JSON.stringify({ playbackRate: 2, ratesByCreator: { '0xabc': 2 } }));
  const prefs = restart();
  await prefs.warmVideoPreferences();
  expect(prefs.getPlaybackRateFor('0xdef')).toBe(1);
  expect(prefs.getPlaybackRateFor('0xabc')).toBe(2);
});
