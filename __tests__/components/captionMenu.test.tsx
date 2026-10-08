import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import CaptionOverlay, { type CaptionControls } from '../../components/VideoPlayerCore/CaptionOverlay';
import { useVoiceDub } from '../../hooks/useVoiceDub';
import { useTranscript } from '../../hooks/useTranscript';

let mockDubOn = false;
let mockAppLang = 'en';
let mockSourceLang = '';

jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles: unknown) => styles, flatten: (styles: unknown) => styles },
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: mockAppLang } }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../../components/common/MediaControlGlyph', () => ({ MediaControlIcon: 'Icon' }));
jest.mock('../../components/VideoPlayerCore/CaptionFixSheet', () => () => null);
jest.mock('../../libs', () => ({ toastInfo: jest.fn() }));
jest.mock('../../hooks/useTranscript', () => ({
  useTranscript: jest.fn(() => ({ transcript: mockSourceLang ? { id: 'transcript', source_lang: mockSourceLang, segments: [] } : null, status: 'ready', inFlight: false, canRetry: false })),
  useTranscriptTranslation: () => ({ translation: { status: 'ready', segments: [{ start: 0, end: 2, text: 'Hola' }] } }),
}));
jest.mock('../../hooks/useTranscriptCorrections', () => ({
  useTranscriptCorrections: () => ({ accepted: new Map() }), applyCorrections: (lines: unknown) => lines,
}));
jest.mock('../../hooks/useVideoDub', () => ({ useDubSettings: () => ({ on: mockDubOn, lang: null }), setDubSettings: jest.fn() }));
jest.mock('../../hooks/useCachedVideoDub', () => ({ useCachedVideoDub: jest.fn(() => undefined) }));
jest.mock('../../hooks/useCachedDubAudio', () => ({ useCachedDubAudio: jest.fn() }));
jest.mock('../../hooks/useVoiceDub', () => ({ useVoiceDub: jest.fn(), baseLang: (lang: string) => lang, findVoice: jest.fn(() => Promise.resolve({ identifier: 'es' })), speechAvailable: true }));
jest.mock('../../libs/subtitlePrefs', () => ({
  SUBTITLE_LANGUAGES: [{ code: 'original', name: 'Original' }], SUBTITLE_SIZES: { xs: 11 },
  getSubtitleLang: () => 'original', getSubtitleSize: () => 'xs', getSubtitlesEnabled: () => false,
  setSubtitleLang: jest.fn(), setSubtitlesEnabled: jest.fn(), splitIntoLines: (lines: unknown) => lines,
}));

describe('subtitle settings menu', () => {
  beforeEach(() => {
    mockDubOn = false; mockAppLang = 'en'; mockSourceLang = '';
    (useVoiceDub as jest.Mock).mockClear();
    (useTranscript as jest.Mock).mockClear();
  });
  it('opens on release and stays open while captions are switched', () => {
    const view = render(<CaptionOverlay tokenId={123} positionMs={0} />);
    const menu = () => view.UNSAFE_getByType('Modal' as any);
    const button = view.getByLabelText('Subtitles off');
    fireEvent(button, 'pressIn');
    expect(menu().props.visible).toBe(false);
    fireEvent(button, 'pressOut');
    fireEvent.press(button);
    expect(menu().props.visible).toBe(true);
    fireEvent.press(view.getByText('subtitles.off'));
    expect(menu().props.visible).toBe(true);
    expect(view.getByText('subtitles.on')).toBeTruthy();
  });

  it('keeps the feed-driven language menu mounted when controls hide', () => {
    let controls: CaptionControls | null = null;
    const onControls = (next: CaptionControls | null) => { controls = next; };
    const view = render(<CaptionOverlay tokenId={123} positionMs={0} hideButton onControls={onControls} />);
    // The feed invokes this from the button's onPress, after release.
    act(() => controls!.openLanguages());
    view.rerender(<CaptionOverlay tokenId={123} positionMs={500} hideButton controlsVisible={false} onControls={onControls} />);
    expect(view.UNSAFE_getByType('Modal' as any).props.visible).toBe(true);
  });

  it('automatically speaks an audible foreign video in the app language with captions off', async () => {
    mockDubOn = true; mockAppLang = 'es'; mockSourceLang = 'en';
    const player = { playing: true, muted: false, volume: 0.8, addListener: () => ({ remove: jest.fn() }) };
    render(<CaptionOverlay tokenId={123} positionMs={0} player={player as any} />);
    await act(async () => {});
    expect(useVoiceDub).toHaveBeenLastCalledWith(expect.objectContaining({ lang: 'es', enabled: true }));
  });

  it('does not fetch or speak a muted card', () => {
    mockDubOn = true; mockAppLang = 'es'; mockSourceLang = 'en';
    const player = { playing: true, muted: true, volume: 0.8, addListener: () => ({ remove: jest.fn() }) };
    render(<CaptionOverlay tokenId={123} positionMs={0} player={player as any} />);
    expect(useTranscript).not.toHaveBeenCalledWith('video', '123', true);
    expect(useVoiceDub).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  });
});
