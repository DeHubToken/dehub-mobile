import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useTranslation } from '../../hooks/useTranslation';
import { translateText } from '../../services/translation.service';
import { setAutoTranslateEnabled } from '../../libs/auto-translate-setting';
import { queueAutoTranslate } from '../../libs/auto-translate-queue';
import { storage } from '../../libs/storage';
import { toastSuccess, toastLoading } from '../../libs';

jest.mock('../../services/translation.service', () => ({
  translateText: jest.fn(),
  getUserLanguage: jest.fn(() => 'tr'),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'tr' } }),
}));

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
    mockQueued.push(run);
    return jest.fn();
  }),
}));

const mockTranslate = translateText as jest.Mock;
const mockQueue = queueAutoTranslate as jest.Mock;

const SPANISH_POST = { title: 'Hola', description: 'Buenos días a todos' };

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
    mockTranslate.mockResolvedValue({
      translatedText: 'çevrilmiş',
      sourceLang: 'es',
      sameLanguage: false,
    });
  });

  describe('auto-translate', () => {
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
      renderHook(() => useTranslation({ title: 'Hola' }, 'es'));
      await runQueuedWork();

      expect(mockTranslate).toHaveBeenCalledWith('Hola', 'tr', 'es');
    });

    it('does not pass "und" off as a source language', async () => {
      renderHook(() => useTranslation({ title: 'Hola' }, 'und'));
      await runQueuedWork();

      // A `und|tr` pair is answered by MyMemory with a stranger's segment out
      // of its shared memory, not an error.
      expect(mockTranslate).toHaveBeenCalledWith('Hola', 'tr', 'auto');
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

      expect(result.current.shouldShow).toBe(false);

      await runQueuedWork();

      // Without this the reader has no way back to the original.
      expect(result.current.isTranslated).toBe(true);
      expect(result.current.shouldShow).toBe(true);
    });

    it('offers a control on a labelled foreign post before anything is translated', () => {
      const { result } = renderHook(() => useTranslation(SPANISH_POST, 'es'));
      expect(result.current.shouldShow).toBe(true);
    });

    it('offers none on a post in the reader’s own language', () => {
      const { result } = renderHook(() => useTranslation({ title: 'Merhaba' }, 'tr'));
      expect(result.current.shouldShow).toBe(false);
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
});
