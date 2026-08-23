/**
 * The assistant's settings sheet.
 * ===============================
 * Port of web's unified settings drawer: chat model, image model, video model
 * (grouped by tier), voice and the always-speak toggle.
 *
 * None of this existed here. `AssistantHeader` even took an `onSettingsPress`
 * prop that the screen never passed, so the button was invisible: every mobile
 * conversation ran on the default `auto` chat model with no way to change it,
 * and the image/video model was whatever the paywall sheet happened to default
 * to.
 */

import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
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
import Icon, { type IconName } from '../ui/Icon';
import {
  CHAT_MODEL_OPTIONS,
  IMAGE_MODEL_OPTIONS,
  VIDEO_MODEL_OPTIONS,
  VOICE_PREFERENCE_OPTIONS,
  type VideoModel,
} from '../../config/ai-models.constants';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.85;

export interface AssistantSettings {
  chatModel: string;
  imageModel: string;
  videoModel: string;
  voice: string;
  alwaysSpeakReplies: boolean;
}

interface AssistantSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  settings: AssistantSettings;
  onChange: (next: Partial<AssistantSettings>) => void;
}

interface RowProps {
  emoji: string;
  name: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
}

const OptionRow: React.FC<RowProps> = ({ emoji, name, description, selected, onPress }) => (
  <TouchableOpacity
    style={[s.row, selected && s.rowSelected]}
    onPress={onPress}
    activeOpacity={0.75}
    accessibilityRole="button"
    accessibilityState={{ selected }}
  >
    <Text style={s.rowEmoji}>{emoji}</Text>
    <View style={{ flex: 1 }}>
      <Text style={s.rowName}>{name}</Text>
      {!!description && <Text style={s.rowDesc}>{description}</Text>}
    </View>
    {selected && <Icon name="Check" size={16} color="#F9FBFF" />}
  </TouchableOpacity>
);

const SectionHeader: React.FC<{ icon: IconName; label: string }> = ({ icon, label }) => (
  <View style={s.sectionHeader}>
    <Icon name={icon} size={14} color="#A6A9AC" />
    <Text style={s.sectionLabel}>{label}</Text>
  </View>
);

const TIERS: { key: VideoModel['tier']; label: string }[] = [
  { key: 'premium', label: 'Premium' },
  { key: 'standard', label: 'Standard' },
  { key: 'fast', label: 'Fast' },
];

const AssistantSettingsSheetComponent: React.FC<AssistantSettingsSheetProps> = ({
  visible,
  onClose,
  settings,
  onChange,
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

  const videoByTier = useMemo(
    () => TIERS.map((tier) => ({
      ...tier,
      models: VIDEO_MODEL_OPTIONS.filter((m) => m.tier === tier.key),
    })).filter((group) => group.models.length > 0),
    [],
  );

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
                  <Icon name="Settings" size={20} color="#F9FBFF" />
                  <Text style={s.title}>AI Settings</Text>
                </View>
                <TouchableOpacity onPress={closeSheet} activeOpacity={0.7} hitSlop={8}>
                  <Icon name="X" size={20} color="#6F7174" />
                </TouchableOpacity>
              </View>
            </Animated.View>
          </GestureDetector>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
            <SectionHeader icon="Sparkles" label="Chat model" />
            {CHAT_MODEL_OPTIONS.map((model) => (
              <OptionRow
                key={model.id}
                emoji={model.emoji}
                name={model.name}
                description={model.description}
                selected={settings.chatModel === model.id}
                onPress={() => onChange({ chatModel: model.id })}
              />
            ))}

            <View style={s.sectionDivider} />
            <SectionHeader icon="Image" label="Image model" />
            {IMAGE_MODEL_OPTIONS.map((model) => (
              <OptionRow
                key={model.id}
                emoji={model.emoji}
                name={model.name}
                description={model.description}
                selected={settings.imageModel === model.id}
                onPress={() => onChange({ imageModel: model.id })}
              />
            ))}

            <View style={s.sectionDivider} />
            <SectionHeader icon="Video" label="Video model" />
            {videoByTier.map((group) => (
              <View key={group.key}>
                <Text style={s.tierLabel}>{group.label}</Text>
                {group.models.map((model) => (
                  <OptionRow
                    key={model.id}
                    emoji={model.emoji}
                    name={model.name}
                    description={model.description}
                    selected={settings.videoModel === model.id}
                    onPress={() => onChange({ videoModel: model.id })}
                  />
                ))}
              </View>
            ))}

            <View style={s.sectionDivider} />
            <SectionHeader icon="Volume2" label="AI voice" />
            {VOICE_PREFERENCE_OPTIONS.map((voice) => (
              <OptionRow
                key={voice.id}
                emoji={voice.emoji}
                name={voice.name}
                description={voice.description}
                selected={settings.voice === voice.id}
                onPress={() => onChange({ voice: voice.id })}
              />
            ))}

            <View style={s.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>Always speak replies</Text>
                <Text style={s.rowDesc}>Read every answer aloud, not just voice ones</Text>
              </View>
              <Switch
                value={settings.alwaysSpeakReplies}
                onValueChange={(value) => onChange({ alwaysSpeakReplies: value })}
                trackColor={{ false: 'rgba(255,255,255,0.2)', true: 'rgba(255,255,255,0.5)' }}
                thumbColor="#F4F4F5"
              />
            </View>
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
  scrollContent: { paddingBottom: 32 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  sectionLabel: { color: '#A6A9AC', fontSize: 13 },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 12,
  },
  tierLabel: {
    color: '#6F7174',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  rowSelected: { backgroundColor: 'rgba(255,255,255,0.07)' },
  rowEmoji: { fontSize: 18 },
  rowName: { color: '#F9FBFF', fontSize: 14, fontWeight: '500' },
  rowDesc: { color: '#6F7174', fontSize: 11, marginTop: 2 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginTop: 4,
  },
});

export default memo(AssistantSettingsSheetComponent);
