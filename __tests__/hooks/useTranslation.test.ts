import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useTranslation } from '../../hooks/useTranslation';
import { translateText, getUserLanguage } from '../../services/translation.service';
import { setAutoTranslateEnabled } from '../../libs/auto-translate-setting';
import { queueAutoTranslate } from '../../libs/auto-translate-queue';
import { storage } from '../../libs/storage';
import { toastSuccess, toastLoading } from '../../libs';

jest.mock('../../services/translation.service', () => ({
  translateText: jest.fn(),
  getUserLanguage: jest.fn(() => 'tr'),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: mockLanguage } }),
}));
let mockLanguage = 'tr';

jest.mock('../../libs', () => ({
  toastLoading: jest.fn(() => 'toast-id'),
  toastSuccess: jest.fn(),
  toastError: jest.fn(),
  dismissToast: jest.fn(),
}));

// The queue is held rather than run, so these tests can assert that the hook
// DEFERS the work — and then run it on demand without leaning on timer
// interleaving. The queue's own scheduling has its own test file.
const mockQueued: Array<() => Promise<unknown>> = [];
jest.mock('../../libs/auto-translate-queue', () => ({
  queueAutoTranslate: jest.fn((run: () => Promise<unknown>) => {
    let cancelled = false;
    mockQueued.push(() => cancelled ? Promise.resolve() : run());
    return jest.fn(() => { cancelled = true; });
  }),
}));

const mockTranslate = translateText as jest.Mock;
const mockQueue = queueAutoTranslate as jest.Mock;

const SPANISH_POST = { title: 'Hola', description: 'Buenos días a todos, estamos preparando una nueva comunidad para compartir nuestras historias y nuestros proyectos.' };

async function runQueuedWork() {
  const jobs = mockQueued.splice(0, mockQueued.length);
  await act(async () => {
    await Promise.all(jobs.map((job) => job()));
  });
}

describe('hooks/useTranslation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueued.length = 0;
    storage.clearAll();
    mockLanguage = 'tr';
    (getUserLanguage as jest.Mock).mockImplementation(() => mockLanguage);
    mockTranslate.mockResolvedValue({
      translatedText: 'çevrilmiş',
      sourceLang: 'es',
      sameLanguage: false,
    });
  });

  describe('auto-translate', () => {
    it('translates the short captions that web translates', async () => {
      renderHook(() => useTranslation({ content: 'Buenos dias amigos' }, undefined, true, true));
      await runQueuedWork();
      expect(mockTranslate).toHaveBeenCalledWith('Buenos dias amigos', 'tr', 'auto', { isPublic: true });
    });

    it('reacts when auto-translate is enabled on an already mounted post', async () => {
      setAutoTranslateEnabled(false);
      const { result } = renderHook(() => useTranslation(SPANISH_POST, 'es'));
      act(() => setAutoTranslateEnabled(true));
      await runQueuedWork();
      expect(result.current.isTranslated).toBe(true);
    });

    it('does not lose work cancelled before the queue starts', async () => {
      const { result } = renderHook(() => useTranslation(SPANISH_POST, 'es'));
      act(() => setAutoTranslateEnabled(false));
      await runQueuedWork();
      expect(mockTranslate).not.toHaveBeenCalled();
      act(() => setAutoTranslateEnabled(true));
      await runQueuedWork();
      expect(result.current.isTranslated).toBe(true);
    });

    it('reschedules when the language label arrives before the queue starts', async () => {
      const { result, rerender } = renderHook(
        ({ language }: { language?: string }) => useTranslation(SPANISH_POST, language),
        { initialProps: { language: undefined } },
      );
      rerender({ language: 'es' });
      await runQueuedWork();
      expect(result.current.isTranslated).toBe(true);
      expect(mockTranslate).toHaveBeenCalledTimes(2);
    });

    it('translates into a newly selected language after a successful translation', async () => {
      const { result, rerender } = renderHook(() => useTranslation(SPANISH_POST, 'es'));
      await runQueuedWork();
      mockLanguage = 'fr';
      rerender({});
      expect(result.current.isTranslated).toBe(false);
      await runQueuedWork();
      expect(mockTranslate).toHaveBeenCalledWith('Hola', 'fr', 'es', { isPublic: false });
      expect(result.current.isTranslated).toBe(true);
    });

    it('drops the previous language response while the new language is in flight', async () => {
      let answerOld!: (value: unknown) => void;
      let answerNew!: (value: unknown) => void;
      mockTranslate
        .mockImplementationOnce(() => new Promise(resolve => { answerOld = resolve; }))
        .mockImplementationOnce(() => new Promise(resolve => { answerNew = resolve; }));
      const { result, rerender } = renderHook(() => useTranslation({ content: SPANISH_POST.description }, 'es', false));
      act(() => result.current.handleTranslate());
      mockLanguage = 'fr';
      rerender({});
      act(() => result.current.handleTranslate());
      await act(async () => answerOld({ translatedText: 'old language', sourceLang: 'es', sameLanguage: false }));
      expect(result.current.isTranslated).toBe(false);
      expect(result.current.isLoading).toBe(true);
      await act(async () => answerNew({ translatedText: 'new language', sourceLang: 'es', sameLanguage: false }));
      expect(result.current.translatedTexts.content).toBe('new language');
    });

    it('resets an edited post even when its post key has not changed', async () => {
      const { result, rerender } = renderHook(
        ({ content }: { content: string }) => useTranslation({ content }, 'es', true, true, 'same-post'),
        { initialProps: { content: SPANISH_POST.description } },
      );
      await runQueuedWork();
      rerender({ content: 'Otra publicación completamente distinta sobre el tiempo de hoy en la ciudad.' });
      expect(result.current.isTranslated).toBe(false);
      await runQueuedWork();
      expect(mockTranslate).toHaveBeenCalledTimes(2);
    });

    it('translates a foreign post without being asked', async () => {
      const { result } = renderHook(() => useTranslation(SPANISH_POST, 'es'));

      // Queued, not fired: the feed paints before anything decorating it runs.
      expect(mockQueue).toHaveBeenCalledTimes(1);
      expect(mockTranslate).not.toHaveBeenCalled();

      await runQueuedWork();

      expect(result.current.isTranslated).toBe(true);
      expect(result.current.translatedTexts.description).toBe('çevrilmiş');
    });

    it('asks the provider for the language the reader chose', async () => {
      renderHook(() => useTranslation(SPANISH_POST, 'es'));
      await runQueuedWork();

      expect(mockTranslate).toHaveBeenCalledWith('Hola', 'tr', 'es', { isPublic: false });
    });

    it('marks the request public only when the caller says so', async () => {
      renderHook(() => useTranslation(SPANISH_POST, 'es', true, true));
      await runQueuedWork();

      expect(mockTranslate).toHaveBeenCalledWith('Hola', 'tr', 'es', { isPublic: true });
    });

    it('does not pass "und" off as a source language', async () => {
      renderHook(() => useTranslation(SPANISH_POST, 'und'));
      await runQueuedWork();

      // A `und|tr` pair is answered by MyMemory with a stranger's segment out
      // of its shared memory, not an error.
      expect(mockTranslate).toHaveBeenCalledWith('Hola', 'tr', 'auto', { isPublic: false });
    });

    it('stays quiet: no toasts for work the reader did not ask for', async () => {
      renderHook(() => useTranslation(SPANISH_POST, 'es'));
      await runQueuedWork();

      expect(toastLoading).not.toHaveBeenCalled();
      expect(toastSuccess).not.toHaveBeenCalled();
    });

    it('leaves the spinner alone so a scrolled-past card never flashes "Translating…"', async () => {
      const { result } = renderHook(() => useTranslation(SPANISH_POST, 'es'));
      await runQueuedWork();

      expect(result.current.isLoading).toBe(false);
    });

    it('translates a short live chat line', async () => {
      const LINE = { content: 'hola a todos' };
      renderHook(() => useTranslation(LINE, undefined, 'chat', true));
      await runQueuedWork();

      expect(mockTranslate).toHaveBeenCalledWith('hola a todos', 'tr', 'auto', { isPublic: true });
    });

    it('leaves a chat line with almost no letters alone', () => {
      const LINE = { content: 'gm 🔥' };
      renderHook(() => useTranslation(LINE, undefined, 'chat', true));

      expect(mockQueue).not.toHaveBeenCalled();
    });

    it('does nothing when the reader has turned auto-translate off', async () => {
      setAutoTranslateEnabled(false);

      const { result } = renderHook(() => useTranslation(SPANISH_POST, 'es'));

      expect(mockQueue).not.toHaveBeenCalled();
      expect(result.current.isTranslated).toBe(false);
    });

    it('does not ask about a post already in the reader’s language', () => {
      renderHook(() => useTranslation({ title: 'Merhaba' }, 'tr'));

      // Cheaper than being told `sameLanguage` — and on a feed matching the
      // reader, this is most of it.
      expect(mockQueue).not.toHaveBeenCalled();
    });

    it('treats a regional tag as the same language', () => {
      renderHook(() => useTranslation({ title: 'Merhaba' }, 'tr-TR'));
      expect(mockQueue).not.toHaveBeenCalled();
    });

    it('does not translate private content that opted out', () => {
      renderHook(() => useTranslation(SPANISH_POST, 'es', false));

      // Translating uploads the body to a shared third-party memory. A direct
      // message is not ours to send on the reader's behalf.
      expect(mockQueue).not.toHaveBeenCalled();
    });

    it('skips a post with nothing to translate', () => {
      renderHook(() => useTranslation({ title: '🎉🎉', description: '' }, 'es'));
      expect(mockQueue).not.toHaveBeenCalled();
    });

    it('queues once, not once per render', async () => {
      const { rerender } = renderHook(() => useTranslation(SPANISH_POST, 'es'));
      await runQueuedWork();

      rerender({});
      rerender({});

      expect(mockQueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('same-language responses', () => {
    it('does not claim a translation when the body came back unchanged', async () => {
      mockTranslate.mockResolvedValue({
        translatedText: 'Hola',
        sourceLang: 'tr',
        sameLanguage: true,
      });

      const { result } = renderHook(() => useTranslation(SPANISH_POST, 'es'));
      await runQueuedWork();

      // Otherwise every post in a matching-language feed shows "Show original"
      // on a change that never happened.
      expect(result.current.isTranslated).toBe(false);
    });
  });

  describe('controls', () => {
    it('offers a control on a post the backend never labelled, once translated', async () => {
      const { result } = renderHook(() => useTranslation(SPANISH_POST, undefined));

      expect(result.current.shouldShow).toBe(true);

      await runQueuedWork();

      // Without this the reader has no way back to the original.
      expect(result.current.isTranslated).toBe(true);
      expect(result.current.shouldShow).toBe(true);
    });

    it('offers a control on a labelled foreign post before anything is translated', () => {
      const { result } = renderHook(() => useTranslation(SPANISH_POST, 'es'));
      expect(result.current.shouldShow).toBe(true);
    });

    it('offers manual translation when a short caption cannot be identified reliably', () => {
      const { result } = renderHook(() => useTranslation({ title: 'Merhaba' }, 'tr'));
      expect(result.current.shouldShow).toBe(true);
    });

    it('returns to the original on request and stays there', async () => {
      const { result, rerender } = renderHook(() => useTranslation(SPANISH_POST, 'es'));
      await runQueuedWork();
      expect(result.current.isTranslated).toBe(true);

      act(() => result.current.handleShowOriginal());
      expect(result.current.isTranslated).toBe(false);

      // A re-render must not silently undo the reader's choice.
      rerender({});
      expect(mockQueued).toHaveLength(0);
      expect(result.current.isTranslated).toBe(false);
    });
  });

  describe('manual translate', () => {
    it('does not label English captions with a legacy Swedish guess', async () => {
      const { result } = renderHook(() => useTranslation({ content: 'It is well' }, 'sv'));
      expect(result.current.sourceLang).toBeNull();
      expect(mockQueue).not.toHaveBeenCalled();
      await act(async () => { result.current.handleTranslate(); });
      expect(mockTranslate).toHaveBeenCalledWith('It is well', 'tr', 'auto', { isPublic: false });
    });

    it('keeps a successful title and the original body when the body fails', async () => {
      mockTranslate.mockImplementation((text: string) => text === 'Hola'
        ? Promise.resolve({ translatedText: 'Merhaba', sourceLang: 'es', sameLanguage: false })
        : Promise.reject(new Error('unavailable')));
      const { result } = renderHook(() => useTranslation(SPANISH_POST, 'es', false));
      await act(async () => { result.current.handleTranslate(); });
      expect(result.current.isTranslated).toBe(true);
      expect(result.current.translatedTexts).toEqual({ title: 'Merhaba', description: SPANISH_POST.description });
      expect(toastSuccess).not.toHaveBeenCalled();
    });
    it('narrates the work the reader asked for', async () => {
      setAutoTranslateEnabled(false);
      const { result } = renderHook(() => useTranslation(SPANISH_POST, 'es'));

      await act(async () => {
        result.current.handleTranslate();
      });

      await waitFor(() => expect(result.current.isTranslated).toBe(true));
      expect(toastLoading).toHaveBeenCalled();
      expect(toastSuccess).toHaveBeenCalledWith('Post translated');
    });

    it('says so rather than looking broken when there was nothing to translate', async () => {
      setAutoTranslateEnabled(false);
      mockTranslate.mockResolvedValue({
        translatedText: 'Hola',
        sourceLang: 'es',
        sameLanguage: true,
      });
      const { result } = renderHook(() => useTranslation(SPANISH_POST, 'es'));

      await act(async () => {
        result.current.handleTranslate();
      });

      expect(toastSuccess).toHaveBeenCalledWith('Already in your language');
      expect(result.current.isTranslated).toBe(false);
    });
  });

  describe('a card handed another post', () => {
    const POST_A = { description: SPANISH_POST.description };
    const POST_B = { description: 'Otra publicación completamente distinta sobre el tiempo de hoy en la ciudad.' };

    it('starts over, and drops the answer still out for the previous post', async () => {
      setAutoTranslateEnabled(false);
      let answerA!: (value: unknown) => void;
      mockTranslate.mockImplementationOnce(() => new Promise((resolve) => { answerA = resolve; }));
      const { result, rerender } = renderHook(
        ({ texts, postKey }: { texts: Record<string, string>; postKey: string }) =>
          useTranslation(texts, 'es', true, true, postKey),
        { initialProps: { texts: POST_A, postKey: 'a' } },
      );

      act(() => result.current.handleTranslate());
      expect(result.current.isLoading).toBe(true);

      rerender({ texts: POST_B, postKey: 'b' });
      expect(result.current.isLoading).toBe(false);

      await act(async () => {
        answerA({ translatedText: 'çevrilmiş A', sourceLang: 'es', sameLanguage: false });
      });
      // A's translation never lands on B.
      expect(result.current.isTranslated).toBe(false);
      expect(result.current.translatedTexts).toEqual({});
      expect(result.current.isLoading).toBe(false);

      // And B is free to translate itself.
      await act(async () => { result.current.handleTranslate(); });
      expect(result.current.isTranslated).toBe(true);
      expect(result.current.translatedTexts.description).toBe('çevrilmiş');
    });

    it('does not carry a translation onto the next post', async () => {
      const { result, rerender } = renderHook(
        ({ texts, postKey }: { texts: Record<string, string>; postKey: string }) =>
          useTranslation(texts, 'es', true, true, postKey),
        { initialProps: { texts: POST_A, postKey: 'a' } },
      );
      await runQueuedWork();
      expect(result.current.isTranslated).toBe(true);

      rerender({ texts: POST_B, postKey: 'b' });
      expect(result.current.isTranslated).toBe(false);
      expect(result.current.translatedTexts).toEqual({});

      // B is auto-translated in its own right.
      await runQueuedWork();
      expect(result.current.isTranslated).toBe(true);
    });
  });
});
