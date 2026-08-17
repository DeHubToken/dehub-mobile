import { supabase } from '../../services/supabase';
import { storage } from '../../libs/storage';

jest.mock('../../services/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

jest.mock('../../i18n', () => ({
  __esModule: true,
  default: { language: 'tr' },
}));

const mockInvoke = supabase.functions.invoke as jest.Mock;

// Fresh module state per test: the cache, the persisted blob and the in-flight
// map all live at module scope.
function loadService() {
  let mod: typeof import('../../services/translation.service');
  jest.isolateModules(() => {
    mod = require('../../services/translation.service');
  });
  return mod!;
}

describe('services/translation.service', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    storage.clearAll();
  });

  describe('translateText', () => {
    it('returns the translation and the detected source language', async () => {
      mockInvoke.mockResolvedValue({
        data: { translatedText: 'Merhaba', detectedLanguage: { language: 'es', confidence: 1 } },
        error: null,
      });

      const { translateText } = loadService();
      const result = await translateText('Hola', 'tr', 'es');

      expect(result).toEqual({ translatedText: 'Merhaba', sourceLang: 'es', sameLanguage: false });
      expect(mockInvoke).toHaveBeenCalledWith('translate-text', {
        body: { text: 'Hola', targetLang: 'tr', sourceLang: 'es' },
      });
    });

    it('reports sameLanguage when the server says the text needed nothing', async () => {
      mockInvoke.mockResolvedValue({
        data: { translatedText: 'Hello there', sameLanguage: true },
        error: null,
      });

      const { translateText } = loadService();
      const result = await translateText('Hello there', 'en');

      // Callers use this to avoid claiming a post was translated when it was
      // handed straight back.
      expect(result.sameLanguage).toBe(true);
    });

    it('reports sameLanguage when the body comes back untouched without the flag', async () => {
      mockInvoke.mockResolvedValue({ data: { translatedText: 'Hello there  ' }, error: null });

      const { translateText } = loadService();
      const result = await translateText('Hello there', 'en');

      expect(result.sameLanguage).toBe(true);
    });

    it('serves a repeat request from cache without calling the function again', async () => {
      mockInvoke.mockResolvedValue({
        data: { translatedText: 'Merhaba', detectedLanguage: { language: 'es', confidence: 1 } },
        error: null,
      });

      const { translateText } = loadService();
      await translateText('Hola', 'tr', 'es');
      const second = await translateText('Hola', 'tr', 'es');

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(second.translatedText).toBe('Merhaba');
      expect(second.sameLanguage).toBe(false);
    });

    it('does not confuse two posts that share a long opening', async () => {
      // The cache key used to truncate at 200 characters. Persisting the cache
      // would have made a collision outlive the app, and posts sharing a long
      // prefix are reposts and templated announcements, not a thought
      // experiment.
      const shared = 'a'.repeat(400);
      mockInvoke
        .mockResolvedValueOnce({ data: { translatedText: 'first' }, error: null })
        .mockResolvedValueOnce({ data: { translatedText: 'second' }, error: null });

      const { translateText } = loadService();
      const one = await translateText(`${shared} uno`, 'tr');
      const two = await translateText(`${shared} dos`, 'tr');

      expect(one.translatedText).toBe('first');
      expect(two.translatedText).toBe('second');
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    });

    it('collapses concurrent requests for the same text into one call', async () => {
      mockInvoke.mockResolvedValue({ data: { translatedText: 'Merhaba' }, error: null });

      const { translateText } = loadService();
      const [a, b] = await Promise.all([
        translateText('Hola', 'tr', 'es'),
        translateText('Hola', 'tr', 'es'),
      ]);

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(a.translatedText).toBe('Merhaba');
      expect(b.translatedText).toBe('Merhaba');
    });

    it('lets a later attempt retry after a failure', async () => {
      mockInvoke
        .mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
        .mockResolvedValueOnce({ data: { translatedText: 'Merhaba' }, error: null });

      const { translateText } = loadService();
      await expect(translateText('Hola', 'tr')).rejects.toThrow('boom');

      // A rejected promise must not stay pinned in the in-flight map, or every
      // later attempt at this text replays the same rejection.
      await expect(translateText('Hola', 'tr')).resolves.toMatchObject({
        translatedText: 'Merhaba',
      });
    });

    it('skips the round trip for empty text', async () => {
      const { translateText } = loadService();
      const result = await translateText('   ', 'tr');

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(result.sameLanguage).toBe(true);
    });
  });

  describe('persistence', () => {
    it('reuses a translation stored by a previous launch', async () => {
      jest.useFakeTimers();
      mockInvoke.mockResolvedValue({
        data: { translatedText: 'Merhaba', detectedLanguage: { language: 'es', confidence: 1 } },
        error: null,
      });

      const first = loadService();
      await first.translateText('Hola', 'tr', 'es');
      // The write is coalesced into one timer per tick.
      jest.advanceTimersByTime(1000);
      jest.useRealTimers();

      expect(storage.getString('dehub-translation-cache-v2')).toBeTruthy();

      // A relaunch: fresh module state, same storage.
      const relaunched = loadService();
      const result = await relaunched.translateText('Hola', 'tr', 'es');

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(result.translatedText).toBe('Merhaba');
    });

    it('starts empty rather than throwing on a corrupt blob', async () => {
      storage.set('dehub-translation-cache-v2', '{not json');
      mockInvoke.mockResolvedValue({ data: { translatedText: 'Merhaba' }, error: null });

      const { translateText } = loadService();
      await expect(translateText('Hola', 'tr')).resolves.toMatchObject({
        translatedText: 'Merhaba',
      });
    });
  });

  describe('getUserLanguage', () => {
    it('follows the language chosen in Settings, not the handset', () => {
      // A Turkish reader on an English phone must not be served "translations"
      // back into English.
      const { getUserLanguage } = loadService();
      expect(getUserLanguage()).toBe('tr');
    });
  });
});
