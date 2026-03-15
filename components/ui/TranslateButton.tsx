import React, { memo } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, View } from 'react-native';
import Icon from './Icon';
import { SUPPORTED_LANGUAGES } from '../../services/translation.service';

interface TranslateButtonProps {
  isTranslated: boolean;
  isLoading: boolean;
  detectedLanguage?: string | null;
  onTranslate: () => void;
  onShowOriginal: () => void;
  /** Render inline (in metadata row) vs standalone line */
  inline?: boolean;
}

const TranslateButtonComponent: React.FC<TranslateButtonProps> = ({
  isTranslated,
  isLoading,
  detectedLanguage,
  onTranslate,
  onShowOriginal,
  inline = false,
}) => {
  const langName = detectedLanguage ? SUPPORTED_LANGUAGES[detectedLanguage] : null;

  if (isLoading) {
    return (
      <View style={inline ? { flexDirection: 'row', alignItems: 'center', gap: 4 } : { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
        <ActivityIndicator size="small" color="#60A5FA" style={{ transform: [{ scale: 0.7 }] }} />
        <Text style={{ fontSize: 12, color: '#60A5FA' }}>Translating…</Text>
      </View>
    );
  }

  if (isTranslated) {
    return (
      <TouchableOpacity
        onPress={onShowOriginal}
        activeOpacity={0.7}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={inline ? { flexDirection: 'row', alignItems: 'center', gap: 3 } : { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}
      >
        <Icon name="Undo2" size={12} color="#60A5FA" />
        <Text style={{ fontSize: 12, color: '#60A5FA' }}>See original</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onTranslate}
      activeOpacity={0.7}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={inline ? { flexDirection: 'row', alignItems: 'center', gap: 3 } : { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}
    >
      <Icon name="Globe" size={12} color="#60A5FA" />
      <Text style={{ fontSize: 12, color: '#60A5FA' }}>
        {langName ? `Translate from ${langName}` : 'Translate'}
      </Text>
    </TouchableOpacity>
  );
};

export const TranslateButton = memo(TranslateButtonComponent);
export default TranslateButton;
