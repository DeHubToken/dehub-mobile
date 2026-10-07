import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import CaptionOverlay, { type CaptionControls } from '../../components/VideoPlayerCore/CaptionOverlay';

jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles: unknown) => styles, flatten: (styles: unknown) => styles },
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../../components/common/MediaControlGlyph', () => ({ MediaControlIcon: 'Icon' }));
jest.mock('../../components/VideoPlayerCore/CaptionFixSheet', () => () => null);
jest.mock('../../libs', () => ({ toastInfo: jest.fn() }));
jest.mock('../../hooks/useTranscript', () => ({
  useTranscript: () => ({ transcript: null, status: 'ready', inFlight: false, canRetry: false }),
  useTranscriptTranslation: () => ({ translation: null }),
}));
jest.mock('../../hooks/useTranscriptCorrections', () => ({
  useTranscriptCorrections: () => ({ accepted: new Map() }), applyCorrections: (lines: unknown) => lines,
}));
jest.mock('../../hooks/useVideoDub', () => ({ useDubSettings: () => ({ on: false, lang: null }), setDubSettings: jest.fn() }));
jest.mock('../../hooks/useVoiceDub', () => ({ useVoiceDub: jest.fn(), baseLang: (lang: string) => lang, findVoice: jest.fn() }));
jest.mock('../../libs/subtitlePrefs', () => ({
  SUBTITLE_LANGUAGES: [{ code: 'original', name: 'Original' }], SUBTITLE_SIZES: { xs: 11 },
  getSubtitleLang: () => 'original', getSubtitleSize: () => 'xs', getSubtitlesEnabled: () => false,
  setSubtitleLang: jest.fn(), setSubtitlesEnabled: jest.fn(), splitIntoLines: (lines: unknown) => lines,
}));

describe('subtitle settings menu', () => {
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
    const { act } = require('@testing-library/react-native');
    act(() => controls!.openLanguages());
    view.rerender(<CaptionOverlay tokenId={123} positionMs={500} hideButton controlsVisible={false} onControls={onControls} />);
    expect(view.UNSAFE_getByType('Modal' as any).props.visible).toBe(true);
  });
});
