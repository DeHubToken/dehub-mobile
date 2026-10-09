import React from 'react';
import { render } from '@testing-library/react-native';
import type { VideoPlayer } from 'expo-video';
import CaptionOverlay from '../../components/VideoPlayerCore/CaptionOverlay';

let mockDubOn = true;
let mockSourceLang = '';
jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'es' } }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../components/common/MediaControlGlyph', () => ({ MediaControlIcon: () => null }));
jest.mock('../../components/VideoPlayerCore/CaptionFixSheet', () => () => null);
jest.mock('../../libs', () => ({ toastInfo: jest.fn() }));
jest.mock('../../libs/video-preferences', () => ({ useMediaVolume: () => 1 }));
jest.mock('../../libs/cached-dub-languages', () => ({ hasCachedDubLanguage: () => false }));
jest.mock('../../hooks/useVideoDub', () => ({ useDubSettings: () => ({ on: mockDubOn, lang: 'es' }), setDubSettings: jest.fn() }));
jest.mock('../../hooks/useVoiceDub', () => ({ useVoiceDub: jest.fn(), baseLang: (lang: string) => lang.split('-')[0], speechAvailable: false }));
jest.mock('../../hooks/useCachedVideoDub', () => ({ useCachedVideoDub: () => null }));
jest.mock('../../hooks/useCachedDubAudio', () => ({ useCachedDubAudio: jest.fn() }));
jest.mock('../../hooks/useTranscript', () => ({
  useTranscript: () => ({
    status: mockSourceLang ? 'ready' : 'processing',
    transcript: mockSourceLang ? { id: 'transcript', source_lang: mockSourceLang, segments: [] } : null,
    inFlight: !mockSourceLang, canRetry: false,
  }),
  useTranscriptTranslation: () => ({ translation: null }),
}));
jest.mock('../../hooks/useTranscriptCorrections', () => ({ useTranscriptCorrections: () => ({ accepted: new Map() }), applyCorrections: (segments: unknown) => segments }));
jest.mock('../../libs/subtitlePrefs', () => ({
  getSubtitlesEnabled: () => false, getSubtitleLang: () => 'original', getSubtitleSize: () => 'medium',
  SUBTITLE_SIZES: { medium: 16 }, SUBTITLE_LANGUAGES: [], splitIntoLines: () => [],
}));

beforeEach(() => { mockDubOn = true; mockSourceLang = ''; });

it('offers the mixer for a selected dub while paused, muted, and waiting for a transcript or voice', () => {
  const available = jest.fn();
  const player = { playing: false, muted: true, addListener: () => ({ remove: jest.fn() }) } as unknown as VideoPlayer;
  const props = { tokenId: 123, positionMs: 0, player, onDubAvailableChange: available };
  const { rerender } = render(<CaptionOverlay {...props} />);
  expect(available).toHaveBeenLastCalledWith(true);
  mockSourceLang = 'en';
  rerender(<CaptionOverlay {...props} />);
  expect(available).toHaveBeenLastCalledWith(true);
  mockDubOn = false;
  rerender(<CaptionOverlay {...props} />);
  expect(available).toHaveBeenLastCalledWith(false);
});

it('uses the normal volume control when the video already speaks the selected language', () => {
  mockSourceLang = 'es';
  const available = jest.fn();
  const player = { playing: false, muted: true, addListener: () => ({ remove: jest.fn() }) } as unknown as VideoPlayer;
  render(<CaptionOverlay tokenId={123} positionMs={0} player={player} onDubAvailableChange={available} />);
  expect(available).toHaveBeenLastCalledWith(false);
});
