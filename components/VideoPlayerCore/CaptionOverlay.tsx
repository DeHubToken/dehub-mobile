/**
 * Subtitles for the mobile video player.
 *
 * Mobile had none at all — the web player has had a CC button since June and
 * the app shipped without one. The transcript itself is written by the sweeper
 * before anybody watches, so this is a reader: pick a language, read the line
 * that matches the playhead.
 *
 * Timing comes from the player's own `timeUpdate` position rather than a timer
 * of our own, so captions stay glued to the frame through a seek, a pause and
 * a playback-rate change without any of them being special-cased.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useTranscript,
  useTranscriptTranslation,
  type TranscriptSegment,
} from '../../hooks/useTranscript';
import {
  SUBTITLE_LANGUAGES,
  SUBTITLE_SIZES,
  getSubtitleLang,
  getSubtitleSize,
  getSubtitlesEnabled,
  setSubtitleLang,
  setSubtitlesEnabled,
  splitIntoLines,
  type SubtitleSize,
} from '../../libs/subtitlePrefs';
import {
  useTranscriptCorrections,
  applyCorrections,
} from '../../hooks/useTranscriptCorrections';
import CaptionFixSheet from './CaptionFixSheet';

interface Props {
  /** Numeric post id. The overlay renders nothing without one. */
  tokenId?: number | string | null;
  /** Playhead in milliseconds, from the player's timeUpdate. */
  positionMs: number;
  /** Hide the button with the rest of the chrome, but keep the text on. */
  controlsVisible?: boolean;
  /** Lift the caption line above whatever sits at the bottom of the player. */
  bottomOffset?: number;
}

const CaptionOverlay: React.FC<Props> = ({
  tokenId,
  positionMs,
  controlsVisible = true,
  bottomOffset = 64,
}) => {
  const ref = useMemo(() => {
    const n = typeof tokenId === 'string' ? parseInt(tokenId, 10) : tokenId ?? 0;
    return Number.isFinite(n) && n > 0 ? String(n) : null;
  }, [tokenId]);

  const [enabled, setEnabled] = useState<boolean>(getSubtitlesEnabled);
  const [lang, setLang] = useState<string>(getSubtitleLang);
  const [size] = useState<SubtitleSize>(getSubtitleSize);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);

  // Only fetch once the viewer has shown intent.
  const { transcript, status, inFlight, canRetry, start } = useTranscript(
    'video',
    ref,
    !!ref && (enabled || pickerOpen),
  );

  const isReady = status === 'ready';

  // Treat "same as the spoken language" as original — translating en→en
  // produces garbled duplicates and costs a call.
  const sourceLang = (transcript?.source_lang ?? '').toLowerCase().split('-')[0];
  const targetLang = useMemo(() => {
    const l = (lang || '').toLowerCase();
    if (!l || l === 'original') return 'original';
    const base = l.split('-')[0];
    if (sourceLang && base === sourceLang) return 'original';
    if (!sourceLang && base === 'en') return 'original';
    return l;
  }, [lang, sourceLang]);

  const { translation } = useTranscriptTranslation(
    transcript?.id ?? null,
    targetLang,
    !!ref && enabled && isReady && targetLang !== 'original',
  );

  // Fixes other viewers have had accepted. Applied to the transcript's own
  // segments before the overlay re-wraps them: corrections are keyed on the
  // segment index, and a wrapped display line has no stable identity.
  const { accepted } = useTranscriptCorrections(
    transcript?.id ?? null,
    !!ref && enabled && isReady,
  );

  const lines: TranscriptSegment[] = useMemo(() => {
    if (!isReady) return [];
    const original = applyCorrections(transcript?.segments ?? [], accepted);
    const base =
      targetLang === 'original' || translation?.status !== 'ready'
        ? original
        : // A fix is written against a line in the source language; there is
          // no honest way to graft it onto a machine translation of that line.
          translation.segments;
    return splitIntoLines(base, 42);
  }, [isReady, targetLang, translation, transcript, accepted]);

  /**
   * Which of the transcript's own segments is playing — the index a correction
   * is filed against. Null before the first line and in any gap between them.
   */
  const activeSegment = useMemo(() => {
    const segments = transcript?.segments ?? [];
    if (!segments.length) return null;
    const t = positionMs / 1000;
    const index = segments.findIndex((s) => t >= s.start && t < s.end);
    if (index < 0) return null;
    return { index, text: accepted.get(index)?.text ?? segments[index].text };
  }, [transcript, positionMs, accepted]);

  // Walk the cursor rather than scanning the array every tick — a long video
  // is thousands of lines and this runs four times a second.
  const cursor = useRef(0);
  const [text, setText] = useState('');

  // A new line set (another video, or a language change) invalidates the
  // cursor; the scan below only ever nudges it one step at a time.
  useEffect(() => {
    cursor.current = 0;
  }, [lines]);

  useEffect(() => {
    if (!enabled || !lines.length) {
      if (text) setText('');
      return;
    }
    const t = positionMs / 1000;
    let i = cursor.current;
    while (i < lines.length - 1 && lines[i].end <= t) i++;
    while (i > 0 && lines[i].start > t) i--;
    cursor.current = i;
    const seg = lines[i];
    const next = seg && t >= seg.start && t < seg.end ? seg.text : '';
    if (next !== text) setText(next);
  }, [positionMs, lines, enabled, text]);

  if (!ref) return null;

  const onToggle = () => {
    if (!isReady && !inFlight) {
      // The sweeper usually got here first. If it has not, ask once — and stop
      // asking when the run has spent its attempts, rather than spinning.
      if (canRetry) void start();
      setEnabled(true);
      setSubtitlesEnabled(true);
      return;
    }
    const next = !enabled;
    setEnabled(next);
    setSubtitlesEnabled(next);
  };

  const fontSize = SUBTITLE_SIZES[size];

  return (
    <>
      {enabled && !!text && (
        <View
          pointerEvents="none"
          style={[styles.captionRow, { bottom: bottomOffset }]}
        >
          <Text style={[styles.caption, { fontSize, lineHeight: fontSize * 1.35 }]}>
            {text}
          </Text>
        </View>
      )}

      <Pressable
        onPress={onToggle}
        onLongPress={() => setPickerOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={enabled ? 'Subtitles on' : 'Subtitles off'}
        style={[
          styles.ccButton,
          { opacity: controlsVisible ? 0.9 : 0 },
        ]}
        pointerEvents={controlsVisible ? 'auto' : 'none'}
      >
        {inFlight ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Ionicons
            name="chatbox-ellipses-outline"
            size={16}
            color={enabled ? '#FFFFFF' : 'rgba(255,255,255,0.6)'}
          />
        )}
      </Pressable>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Subtitles</Text>
            <Pressable
              onPress={() => {
                const next = !enabled;
                setEnabled(next);
                setSubtitlesEnabled(next);
              }}
              style={[styles.pill, enabled && styles.pillOn]}
            >
              <Text style={styles.pillText}>{enabled ? 'On' : 'Off'}</Text>
            </Pressable>
          </View>

          {!isReady && (
            <Text style={styles.sheetHint}>
              {inFlight
                ? 'Writing subtitles…'
                : status === 'empty'
                ? 'No speech in this video.'
                : status === 'failed'
                ? 'Subtitles could not be generated.'
                : 'Subtitles are being prepared.'}
            </Text>
          )}

          {/* Auto-captions get names, accents and jargon wrong, and the person
              who can hear the difference is the one watching. Offered only for
              the original language: a fix is written against the source line,
              and grafting it onto a machine translation would be a guess. */}
          {isReady && targetLang === 'original' && (
            <Pressable
              onPress={() => {
                setPickerOpen(false);
                setFixOpen(true);
              }}
              style={styles.langRow}
            >
              <Text style={styles.langText}>Fix the current line</Text>
              <Ionicons name="create-outline" size={16} color="rgba(255,255,255,0.6)" />
            </Pressable>
          )}

          <ScrollView style={styles.langList}>
            {SUBTITLE_LANGUAGES.map((l) => (
              <Pressable
                key={l.code}
                onPress={() => {
                  setLang(l.code);
                  setSubtitleLang(l.code);
                  if (!enabled) {
                    setEnabled(true);
                    setSubtitlesEnabled(true);
                  }
                  setPickerOpen(false);
                }}
                style={styles.langRow}
              >
                <Text style={[styles.langText, lang === l.code && styles.langTextOn]}>
                  {l.name}
                </Text>
                {lang === l.code && (
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <CaptionFixSheet
        visible={fixOpen}
        onClose={() => setFixOpen(false)}
        transcriptId={transcript?.id ?? null}
        segmentIndex={activeSegment?.index ?? null}
        originalText={activeSegment?.text ?? ''}
      />
    </>
  );
};

const styles = StyleSheet.create({
  captionRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 20,
  },
  caption: {
    color: '#FFFFFF',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  ccButton: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 21,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '70%',
    backgroundColor: '#0B0B0C',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sheetTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  sheetHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  pillOn: { backgroundColor: 'rgba(255,255,255,0.15)' },
  pillText: { color: '#FFFFFF', fontSize: 11 },
  langList: { paddingHorizontal: 8 },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  langText: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  langTextOn: { color: '#FFFFFF' },
});

export default CaptionOverlay;
