const mockValues = new Map<string, string>();
jest.mock('../../libs/storage', () => ({ storage: {
  getString: (key: string) => mockValues.get(key),
  set: (key: string, value: string) => mockValues.set(key, value),
  delete: (key: string) => mockValues.delete(key),
} }));
jest.mock('../../services/supabase', () => ({ supabase: {} }));
jest.mock('../../config/queryClient', () => ({ queryClient: {} }));
jest.mock('../../hooks/useTranscript', () => ({ transcriptKey: jest.fn() }));
jest.mock('../../hooks/useVoiceDub', () => ({ findVoice: jest.fn() }));

function load() {
  let dub: typeof import('../../hooks/useVideoDub');
  let auto: typeof import('../../libs/auto-translate-setting');
  jest.isolateModules(() => {
    dub = require('../../hooks/useVideoDub');
    auto = require('../../libs/auto-translate-setting');
  });
  return { dub: dub!, auto: auto! };
}

describe('automatic dub preference', () => {
  beforeEach(() => mockValues.clear());

  it('defaults to automatic dubbing and follows auto-translate', () => {
    const { dub, auto } = load();
    expect(dub.getDubSettings().on).toBe(true);
    auto.setAutoTranslateEnabled(false);
    expect(dub.getDubSettings().on).toBe(false);
    auto.setAutoTranslateEnabled(true);
    expect(dub.getDubSettings().on).toBe(true);
  });

  it('preserves a saved off choice', () => {
    mockValues.set('video-voice-dub-on', 'false');
    const { dub, auto } = load();
    auto.setAutoTranslateEnabled(true);
    expect(dub.getDubSettings().on).toBe(false);
  });

  it('preserves manual dubbing when auto-translate is off and clears an old language', () => {
    const { dub, auto } = load();
    dub.setDubSettings({ on: true, lang: 'zh-TW' });
    auto.setAutoTranslateEnabled(false);
    expect(dub.getDubSettings()).toMatchObject({ on: true, lang: 'zh-TW', automatic: false });
    dub.setDubSettings({ lang: null });
    expect(mockValues.has('video-voice-dub-lang')).toBe(false);
  });
});
