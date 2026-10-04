import { useSheetClosed } from '../../hooks/useSheetClosed';
/**
 * The template picker.
 * ====================
 * The app's copy of the preset strip on dehub.io/creator: every image and video
 * template, grouped, behind a Video / Image switch. Picking one arms it on the
 * composer; the next send wraps whatever was typed in its scaffold and runs on
 * the model it was tuned for.
 */

import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../ui/Icon';
import {
  TEMPLATE_GROUP_KEYS,
  templatesFor,
  type CreatorTemplate,
  type TemplateKind,
} from '../../libs/creatorTemplates';
import { useTranslation } from 'react-i18next';

interface TemplatesSheetProps {
  visible: boolean;
  onClose: () => void;
  activeId: string | null;
  onSelect: (template: CreatorTemplate) => void;
  initialKind?: TemplateKind;
}

/** One emoji per group, so the long list scans by shape as well as by text. */
const GROUP_EMOJI: Record<string, string> = {
  Abstract: '🌀',
  Ads: '📣',
  Brand: '🏷️',
  Camera: '🎥',
  Commercial: '🛍️',
  Design: '✏️',
  Effects: '💥',
  Film: '🎞️',
  'Image to video': '🖼️',
  Portrait: '👤',
  Social: '📱',
};

const TemplatesSheetComponent: React.FC<TemplatesSheetProps> = ({
  visible,
  onClose,
  activeId,
  onSelect,
  initialKind = 'video',
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const sheetHeight = screenHeight * 0.8;
  const translateY = useSharedValue(sheetHeight);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useSheetClosed(visible);
  const [kind, setKind] = useState<TemplateKind>('video');
  const [query, setQuery] = useState('');
  useEffect(() => { if (visible) setKind(initialKind); }, [visible, initialKind]);
  const templates = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return templatesFor(kind).filter((tpl) => !search || [
      t(tpl.nameKey), t(tpl.hintKey), t(TEMPLATE_GROUP_KEYS[tpl.group] ?? tpl.group),
      tpl.template, tpl.sample,
    ].join(' ').toLocaleLowerCase().includes(search));
  }, [kind, query, t]);

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(
        sheetHeight,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        () => runOnJS(setIsFullyClosed)(true),
      );
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const closeSheet = () => {
    translateY.value = withTiming(
      sheetHeight,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      () => runOnJS(onClose)(),
    );
    backdropOpacity.value = withTiming(0, { duration: 180 });
  };

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 60 || e.velocityY > 500) {
        runOnJS(closeSheet)();
      } else {
        translateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  if (isFullyClosed && !visible) return null;

  return (
    <Modal
      visible={!isFullyClosed}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }, backdropStyle]}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeSheet} />
        </Animated.View>

        <Animated.View style={[s.sheet, { height: sheetHeight, paddingBottom: insets.bottom }, sheetStyle]}>
          <View style={[StyleSheet.absoluteFill, s.overlay]} />

          <GestureDetector gesture={panGesture}>
            <Animated.View>
              <View style={s.handleWrap}>
                <View style={s.handle} />
              </View>
              <View style={s.headerRow}>
                <View style={s.headerLeft}>
                  <Icon name="Sparkles" size={20} color="#F9FBFF" />
                  <Text style={s.title}>{t('creator.presets')}</Text>
                </View>
                <TouchableOpacity onPress={closeSheet} activeOpacity={0.7} hitSlop={8}>
                  <Icon name="X" size={20} color="#6F7174" />
                </TouchableOpacity>
              </View>
            </Animated.View>
          </GestureDetector>

          <View style={s.tabs}>
            {(['video', 'image'] as const).map((k) => (
              <TouchableOpacity
                key={k}
                style={[s.tab, kind === k && s.tabActive]}
                onPress={() => { setKind(k); setQuery(''); }}
                activeOpacity={0.75}
                accessibilityRole="tab"
                accessibilityState={{ selected: kind === k }}
              >
                <Text style={[s.tabText, kind === k && s.tabTextActive]}>
                  {t(k === 'video' ? 'creator.navVideo' : 'creator.navImage')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('common.search')}
            accessibilityLabel={t('common.search')}
            placeholderTextColor="#6F7174"
            style={s.search}
            autoCorrect={false}
            returnKeyType="search"
          />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
            {!templates.length && <Text accessibilityRole="text" style={[s.hint, s.empty]}>{t('explorePage.noResults')}</Text>}
            {templates.map((tpl) => {
              const selected = activeId === tpl.id;
              return (
                <TouchableOpacity
                  key={tpl.id}
                  style={[s.row, selected && s.rowSelected]}
                  onPress={() => {
                    onSelect(tpl);
                    closeSheet();
                  }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={s.emoji}>{GROUP_EMOJI[tpl.group] ?? '✨'}</Text>
                  <View style={s.rowText}>
                    <Text style={s.group}>
                      {t(TEMPLATE_GROUP_KEYS[tpl.group] ?? tpl.group)}
                    </Text>
                    <Text style={s.label} numberOfLines={1}>{t(tpl.nameKey)}</Text>
                    <Text style={s.hint} numberOfLines={2}>{t(tpl.hintKey)}</Text>
                  </View>
                  {selected && <Icon name="Check" size={16} color="#F9FBFF" />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const s = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  overlay: {
    backgroundColor: '#0C0C0E',
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
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#F9FBFF', fontSize: 18, fontWeight: '700' },
  scrollContent: { paddingVertical: 8, paddingBottom: 32 },
  search: { marginHorizontal: 20, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', color: '#F9FBFF', fontSize: 14 },
  empty: { paddingHorizontal: 20, paddingVertical: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  rowSelected: { backgroundColor: 'rgba(255,255,255,0.07)' },
  emoji: { fontSize: 20 },
  rowText: { flex: 1 },
  group: {
    color: 'rgba(249,251,255,0.45)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  label: { color: '#F9FBFF', fontSize: 15, fontWeight: '600', marginTop: 2 },
  hint: { color: 'rgba(249,251,255,0.55)', fontSize: 12, marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tabActive: { backgroundColor: '#F9FBFF', borderColor: '#F9FBFF' },
  tabText: { color: '#F9FBFF', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#0C0C0E' },
});

export default memo(TemplatesSheetComponent);
