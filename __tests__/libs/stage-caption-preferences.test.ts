const mockSaved = new Map<string, string>();
let mockLanguage = 'tr-TR';
let mockLanguageChanged: (() => void) | undefined;
let mockHydrate: ((rows: [string, string | null][]) => void) | undefined;

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
jest.mock('i18next', () => ({ __esModule: true, default: {
  get language() { return mockLanguage; },
  on: (_event: string, callback: () => void) => { mockLanguageChanged = callback; },
} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  multiGet: jest.fn(() => new Promise((resolve) => { mockHydrate = resolve; })),
  setItem: jest.fn((key: string, value: string) => { mockSaved.set(key, value); return Promise.resolve(); }),
}));
jest.mock('../../services/supabase', () => ({ supabase: {} }));

describe('stage caption language preferences', () => {
  beforeEach(() => { jest.resetModules(); mockSaved.clear(); mockLanguage = 'tr-TR'; });

  it('defaults to the app language and follows changes before a choice', () => {
    const captions = require('../../hooks/useStageCaptions');
    expect(captions.useCaptionLanguage()).toBe('tr');
    mockLanguage = 'pt_BR';
    mockLanguageChanged?.();
    expect(captions.useCaptionLanguage()).toBe('pt');
  });

  it('keeps a new choice when old storage finishes loading', async () => {
    const captions = require('../../hooks/useStageCaptions');
    captions.setCaptionLanguage('es');
    captions.setShowCaptions(false);
    mockHydrate?.([['show', '1'], ['lang', 'de']]);
    await Promise.resolve();
    expect(captions.useCaptionLanguage()).toBe('es');
    expect(captions.useShowCaptions()).toBe(false);
  });

  it('saves and restores an explicit spoken-language choice', async () => {
    const captions = require('../../hooks/useStageCaptions');
    captions.setCaptionLanguage(null);
    expect(mockSaved.get('dehub.stage.captions.lang')).toBe('source');
    mockLanguage = 'en';
    mockLanguageChanged?.();
    expect(captions.useCaptionLanguage()).toBeNull();
    jest.resetModules();
    const restored = require('../../hooks/useStageCaptions');
    mockHydrate?.([['show', null], ['lang', 'source']]);
    await Promise.resolve();
    expect(restored.useCaptionLanguage()).toBeNull();
  });
});
