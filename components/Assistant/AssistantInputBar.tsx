import { useTranslation as _useCopy } from 'react-i18next';
import React, { memo, useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import SmartImage from '../common/SmartImage';
import Icon from '../ui/Icon';
import { useTranslation } from 'react-i18next';

interface AssistantInputBarProps {
  readOnly?: boolean;
  controls?: React.ReactNode;
  value: string;
  onChangeText: (text: string) => void;
  onSelectionChange?: (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => void;
  onSend: () => void;
  onAttach?: () => void;
  attachedImage?: string | null;
  onRemoveImage?: () => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  sendLabel?: string;
  allowEmpty?: boolean;
  /** Starts or ends voice chat with the ball. */
  onVoicePress?: () => void;
  voiceActive?: boolean;
}

const AssistantInputBar: React.FC<AssistantInputBarProps> = ({
  value,
  onChangeText,
  onSelectionChange,
  onSend,
  onAttach,
  attachedImage,
  onRemoveImage,
  disabled,
  loading,
  placeholder,
  sendLabel,
  allowEmpty = false,
  readOnly = false,
  controls,
  onVoicePress,
  voiceActive,
}) => {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const maxInputHeight = useWindowDimensions().height * 0.3;
  // Grow with the text, as web's auto-expanding textarea does. A single-line
  // input made every multi-paragraph prompt — which is most image prompts —
  // impossible to read back before sending.
  const [height, setHeight] = useState(21);
  const canSend = (value.trim().length > 0 || !!attachedImage || allowEmpty) && !disabled && !loading;

  const handleSubmit = useCallback(() => {
    if (canSend) onSend();
  }, [canSend, onSend]);

  return (
    <View style={s.container}>
      {attachedImage && (
        <View style={s.previewRow}>
          <View style={s.previewWrap}>
            <SmartImage source={{ uri: attachedImage }} recyclingKey={attachedImage} style={s.previewImg} />
            <TouchableOpacity
              style={s.previewRemove}
              onPress={onRemoveImage}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('upload.removeImage')}
            >
              <Icon name="X" size={12} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}
      <View style={s.inputRow}>
        <TextInput
          style={[s.input, { height: Math.min(Math.max(21, height), maxInputHeight) }]}
          placeholder={placeholder ?? (attachedImage ? _copy("copy.413880aa438d", { defaultValue: "Describe your edits…" }) : _copy("copy.ff918d248470", { defaultValue: "Ask me anything..." }))}
          placeholderTextColor="#8B8D90"
          value={value}
          onChangeText={onChangeText}
          onSelectionChange={onSelectionChange}
          onContentSizeChange={(e) => setHeight(e.nativeEvent.contentSize.height)}
          multiline
          editable={!readOnly && !disabled && !loading}
        />
        <View style={s.actions}>
          {controls && <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', gap: 6 }}>{controls}</ScrollView>}
          {!controls && (
            <View style={s.tools}>
              {onAttach && (
                <TouchableOpacity
                  onPress={onAttach}
                  style={s.toolBtn}
                  hitSlop={ACTION_SLOP}
                  disabled={disabled || loading}
                  accessibilityRole="button"
                  accessibilityLabel={t('dm.attachImage')}
                  accessibilityState={{ disabled: disabled || loading }}
                >
                  <Icon name="Paperclip" size={18} color={disabled || loading ? '#3F3F46' : '#A1A1AA'} />
                </TouchableOpacity>
              )}
              {onVoicePress && (
                <TouchableOpacity
                  onPress={onVoicePress}
                  style={[s.toolBtn, voiceActive && s.toolBtnActive]}
                  hitSlop={ACTION_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel={voiceActive ? _copy("copy.dd2108f1cda8", { defaultValue: "Stop Voice Chat" }) : _copy("copy.70438fbf1234", { defaultValue: "Voice Chat (AI)" })}
                  accessibilityState={{ selected: !!voiceActive }}
                >
                  <Icon name="AudioLines" size={18} color={voiceActive ? '#0B0C0D' : '#A1A1AA'} />
                </TouchableOpacity>
              )}
            </View>
          )}
          <TouchableOpacity
            onPress={handleSubmit}
            style={sendLabel
              ? [s.sendBtn, { width: 'auto', paddingHorizontal: 14, flexDirection: 'row', gap: 8, backgroundColor: canSend ? '#F9FBFF' : 'rgba(255,255,255,0.1)' }]
              : [s.sendBtn, { backgroundColor: canSend ? '#F9FBFF' : 'rgba(255,255,255,0.1)' }]}
            hitSlop={ACTION_SLOP}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel={sendLabel ?? t('dm.sendMessage')}
            accessibilityState={{ disabled: !canSend }}
          >
            {loading ? (
              <ActivityIndicator size="small" color={canSend ? '#0B0C0D' : '#F4F4F5'} />
            ) : (
              <Icon name="ArrowUp" size={18} strokeWidth={2.4} color={canSend ? '#0B0C0D' : '#71717A'} />
            )}
            {sendLabel && <Text style={{ color: canSend ? '#0B0C0D' : '#8B8D90', fontSize: 13, fontWeight: '700' }}>{sendLabel}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// The 36pt buttons sit 6pt apart; 4pt of slop each way reaches 44pt without
// neighbouring targets overlapping.
const ACTION_SLOP = { top: 4, bottom: 4, left: 4, right: 4 };

const s = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  previewRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  previewWrap: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImg: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  previewRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 10,
    minHeight: 96,
  },
  input: {
    color: '#F9FBFF',
    fontSize: 15,
    lineHeight: 21,
    paddingTop: 0,
    paddingBottom: 0,
    marginBottom: 10,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  tools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: -6,
  },
  toolBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnActive: {
    backgroundColor: '#F9FBFF',
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(AssistantInputBar);
