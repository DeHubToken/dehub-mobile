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

describe('opt-in dub preference', () => {
  beforeEach(() => mockValues.clear());

  it('defaults to original audio independently of auto-translate', () => {
    const { dub, auto } = load();
    expect(dub.getDubSettings().on).toBe(false);
    auto.setAutoTranslateEnabled(false);
    expect(dub.getDubSettings().on).toBe(false);
    auto.setAutoTranslateEnabled(true);
    expect(dub.getDubSettings().on).toBe(false);
  });

  it('preserves a saved explicit opt-in across reloads', () => {
    mockValues.set('video-voice-dub-on', 'true');
    expect(load().dub.getDubSettings().on).toBe(true);
  });

  it('does not turn the old server-dub key or invalid values into consent', () => {
    mockValues.set('video-dub-on', 'true');
    mockValues.set('video-voice-dub-on', '1');
    expect(load().dub.getDubSettings().on).toBe(false);
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
