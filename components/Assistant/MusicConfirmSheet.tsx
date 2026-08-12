/**
 * Confirm a song before paying for it.
 * ====================================
 * Port of web's `MusicConfirmDialog`. A music job is the most expensive thing
 * the assistant does, so both apps stop and confirm the four things the model
 * actually reads — title, style, voice and lyrics — rather than firing a whole
 * song off one sentence.
 *
 * The four auto-detection helpers are web's regexes verbatim: "a lo-fi track
 * called Night Drive with female vocals" fills all three fields before the
 * sheet is even shown, and drifting from them would mean the same prompt
 * pre-fills differently on each app.
 */

import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../ui/Icon';
import { supabase } from '../../services/supabase';
import { toastError } from '../../libs/toast';
import { createLogger } from '../../libs/logger';

const log = createLogger('MusicConfirmSheet');
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.86;

export interface MusicParams {
  title: string;
  lyrics: string;
  style: string;
  voiceGender: 'male' | 'female' | 'auto';
}

const GENRES = [
  'pop', 'rock', 'hip hop', 'hip-hop', 'rap', 'jazz', 'classical', 'r&b', 'country',
  'electronic', 'edm', 'lo-fi', 'lofi', 'reggae', 'metal', 'punk', 'soul', 'funk', 'blues',
  'indie', 'folk', 'trap', 'drill', 'afrobeat', 'latin', 'k-pop', 'anime', 'ambient', 'chill',
  'upbeat', 'sad', 'romantic', 'dark', 'energetic', 'acoustic', 'synthwave', 'house', 'techno',
];

function extractTitle(prompt: string): string {
  const titleMatch = prompt.match(/(?:called|titled|named)\s+["']?([^"'\n,.]+)["']?/i);
  if (titleMatch) return titleMatch[1].trim();
  const labelMatch = prompt.match(/title\s*[:\-]\s*["']?([^"'\n,.]+)["']?/i);
  if (labelMatch) return labelMatch[1].trim();
  return '';
}

function extractLyrics(prompt: string): string {
  const lyricsMatch = prompt.match(/(?:lyrics?\s*(?:are|is)?\s*[:\-]\s*)([\s\S]+)/i);
  if (lyricsMatch) return lyricsMatch[1].trim();
  const quotedMatch = prompt.match(/"([^"]{20,})"/);
  if (quotedMatch) return quotedMatch[1].trim();
  return '';
}

function extractStyle(prompt: string): string {
  const styleMatch = prompt.match(/(?:style|genre|vibe|mood)\s*[:\-]\s*["']?([^"'\n,.]+)["']?/i);
  if (styleMatch) return styleMatch[1].trim();
  const lower = prompt.toLowerCase();
  const found = GENRES.filter((genre) => lower.includes(genre));
  return found.length > 0 ? found.join(', ') : '';
}

function detectVoiceGender(prompt: string): 'male' | 'female' | 'auto' {
  const lower = prompt.toLowerCase();
  if (/\b(female|woman|girl|soprano|alto)\b/.test(lower)) return 'female';
  if (/\b(male|man|boy|baritone|tenor|bass)\b/.test(lower)) return 'male';
  return 'auto';
}

const GENDER_OPTIONS: { value: MusicParams['voiceGender']; label: string; emoji: string }[] = [
  { value: 'auto', label: 'Auto', emoji: '🎤' },
  { value: 'male', label: 'Male', emoji: '🧑' },
  { value: 'female', label: 'Female', emoji: '👩' },
];

interface MusicConfirmSheetProps {
  visible: boolean;
  onClose: () => void;
  userPrompt: string;
  onConfirm: (params: MusicParams) => void;
}

const MusicConfirmSheetComponent: React.FC<MusicConfirmSheetProps> = ({
  visible,
  onClose,
  userPrompt,
  onConfirm,
}) => {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [style, setStyle] = useState('');
  const [voiceGender, setVoiceGender] = useState<MusicParams['voiceGender']>('auto');
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);

  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useState(!visible);

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      // Re-derive on every open: the sheet is reused for the next song.
      setTitle(extractTitle(userPrompt));
      setLyrics(extractLyrics(userPrompt));
      setStyle(extractStyle(userPrompt));
      setVoiceGender(detectVoiceGender(userPrompt));
      translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(
        SHEET_HEIGHT,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        () => runOnJS(setIsFullyClosed)(true),
      );
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, userPrompt]);

  const closeSheet = useCallback(() => {
    translateY.value = withTiming(
      SHEET_HEIGHT,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      () => runOnJS(onClose)(),
    );
    backdropOpacity.value = withTiming(0, { duration: 180 });
  }, [onClose, translateY, backdropOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  /** Same `generate-lyrics` edge function web uses — free, no credit charge. */
  const handleGenerateLyrics = useCallback(async () => {
    setIsGeneratingLyrics(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-lyrics', {
        body: { title, style, voiceGender, existingLyrics: lyrics, userPrompt },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.lyrics) setLyrics(data.lyrics);
    } catch (err) {
      log.error('lyrics generation failed:', err);
      toastError(err instanceof Error ? err.message : 'Failed to generate lyrics');
    } finally {
      setIsGeneratingLyrics(false);
    }
  }, [title, style, voiceGender, lyrics, userPrompt]);

  if (isFullyClosed && !visible) return null;

  return (
    <Modal
      visible={!isFullyClosed}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }, backdropStyle]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeSheet} />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.keyboardWrap}
        pointerEvents="box-none"
      >
        <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + 12 }, sheetStyle]}>
          <BlurView
            intensity={80}
            tint="dark"
            style={StyleSheet.absoluteFill}
            {...(Platform.OS === 'android' ? { experimentalBlurMethod: 'dimezisBlurView' } : {})}
          />
          <View style={[StyleSheet.absoluteFill, s.overlay]} />

          <View style={s.handleWrap}>
            <View style={s.handle} />
          </View>

          <View style={s.headerRow}>
            <View style={s.headerLeft}>
              <Icon name="Music" size={20} color="#F9FBFF" />
              <Text style={s.title}>Create a song</Text>
            </View>
            <TouchableOpacity onPress={closeSheet} activeOpacity={0.7} hitSlop={8}>
              <Icon name="X" size={20} color="#6F7174" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.label}>Song title</Text>
            <TextInput
              style={s.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Leave blank for AI to decide"
              placeholderTextColor="#4B4D50"
            />

            <Text style={s.label}>Style / genre</Text>
            <TextInput
              style={s.input}
              value={style}
              onChangeText={setStyle}
              placeholder="e.g. lo-fi, upbeat pop, dark trap"
              placeholderTextColor="#4B4D50"
            />

            <Text style={s.label}>Vocals</Text>
            <View style={s.genderRow}>
              {GENDER_OPTIONS.map((option) => {
                const selected = voiceGender === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[s.genderBtn, selected && s.genderBtnSelected]}
                    onPress={() => setVoiceGender(option.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={s.genderEmoji}>{option.emoji}</Text>
                    <Text style={[s.genderLabel, selected && { color: '#F9FBFF' }]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={s.lyricsHeader}>
              <Text style={[s.label, { marginTop: 0 }]}>Lyrics</Text>
              <TouchableOpacity
                onPress={handleGenerateLyrics}
                disabled={isGeneratingLyrics}
                activeOpacity={0.75}
                style={s.lyricsBtn}
              >
                {isGeneratingLyrics ? (
                  <ActivityIndicator size="small" color="#A6A9AC" />
                ) : (
                  <>
                    <Icon name="Sparkles" size={13} color="#A6A9AC" />
                    <Text style={s.lyricsBtnText}>{lyrics ? 'Rewrite' : 'Write for me'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            <TextInput
              style={[s.input, s.textarea]}
              value={lyrics}
              onChangeText={setLyrics}
              placeholder="Leave blank for an instrumental"
              placeholderTextColor="#4B4D50"
              multiline
              textAlignVertical="top"
            />
          </ScrollView>

          <View style={s.footer}>
            <TouchableOpacity style={s.cancelBtn} onPress={closeSheet} activeOpacity={0.7}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.confirmBtn}
              onPress={() => onConfirm({ title, lyrics, style, voiceGender })}
              activeOpacity={0.8}
            >
              <Text style={s.confirmBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const s = StyleSheet.create({
  keyboardWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: SHEET_HEIGHT,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  overlay: {
    backgroundColor: 'rgba(12,12,14,0.92)',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  handleWrap: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#F9FBFF', fontSize: 18, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 16 },
  label: { color: '#A6A9AC', fontSize: 12, fontWeight: '500', marginTop: 14, marginBottom: 6 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F9FBFF',
    fontSize: 14,
  },
  textarea: { minHeight: 120 },
  genderRow: { flexDirection: 'row', gap: 8 },
  genderBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  genderBtnSelected: {
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  genderEmoji: { fontSize: 14 },
  genderLabel: { color: '#A6A9AC', fontSize: 13, fontWeight: '500' },
  lyricsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 6,
  },
  lyricsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    minWidth: 96,
    justifyContent: 'center',
  },
  lyricsBtnText: { color: '#A6A9AC', fontSize: 12, fontWeight: '500' },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cancelBtnText: { color: '#F9FBFF', fontSize: 15, fontWeight: '600' },
  confirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F5',
  },
  confirmBtnText: { color: '#09090B', fontSize: 15, fontWeight: '700' },
});

export default memo(MusicConfirmSheetComponent);
