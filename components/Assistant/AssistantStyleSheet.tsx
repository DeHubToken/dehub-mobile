/**
 * The personality picker.
 * =======================
 * Web's style drawer: the 29 `AI_ASSISTANT_STYLE_OPTIONS` in a scrolling list,
 * chosen from the emoji button in the header.
 *
 * The list already existed in `config/ai-styles.constants.ts` — it was only
 * wired to the post composer's enhance-text flow. The assistant never sent a
 * `style` at all, so every persona on the web app was unreachable here.
 */

import React, { memo, useEffect, useState } from 'react';
import {
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
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
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../ui/Icon';
import { AI_ASSISTANT_STYLE_OPTIONS } from '../../config/ai-styles.constants';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.7;

interface AssistantStyleSheetProps {
  visible: boolean;
  onClose: () => void;
  selectedStyle: string;
  onSelect: (styleId: string) => void;
}

const AssistantStyleSheetComponent: React.FC<AssistantStyleSheetProps> = ({
  visible,
  onClose,
  selectedStyle,
  onSelect,
}) => {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useState(!visible);

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
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
  }, [visible]);

  const closeSheet = () => {
    translateY.value = withTiming(
      SHEET_HEIGHT,
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

        <Animated.View style={[s.sheet, { paddingBottom: insets.bottom }, sheetStyle]}>
          <View style={[StyleSheet.absoluteFill, s.overlay]} />

          <GestureDetector gesture={panGesture}>
            <Animated.View>
              <View style={s.handleWrap}>
                <View style={s.handle} />
              </View>
              <View style={s.headerRow}>
                <View style={s.headerLeft}>
                  <Icon name="Sparkles" size={20} color="#F9FBFF" />
                  <Text style={s.title}>AI Personality</Text>
                </View>
                <TouchableOpacity onPress={closeSheet} activeOpacity={0.7} hitSlop={8}>
                  <Icon name="X" size={20} color="#6F7174" />
                </TouchableOpacity>
              </View>
            </Animated.View>
          </GestureDetector>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
            {AI_ASSISTANT_STYLE_OPTIONS.map((style) => {
              const selected = selectedStyle === style.id;
              return (
                <TouchableOpacity
                  key={style.id}
                  style={[s.row, selected && s.rowSelected]}
                  onPress={() => {
                    onSelect(style.id);
                    closeSheet();
                  }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={s.emoji}>{style.emoji}</Text>
                  <Text style={s.label}>{style.label}</Text>
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
    height: SHEET_HEIGHT,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  rowSelected: { backgroundColor: 'rgba(255,255,255,0.07)' },
  emoji: { fontSize: 20 },
  label: { color: '#F9FBFF', fontSize: 15, flex: 1 },
});

export default memo(AssistantStyleSheetComponent);
