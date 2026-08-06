import React, { memo } from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import Icon from './Icon';
import { colors } from '../../theme/colors';

interface TranslateButtonProps {
  isTranslated: boolean;
  isLoading: boolean;
  detectedLanguage?: string | null;
  onTranslate: () => void;
  onShowOriginal: () => void;
  /** Render inline (in metadata row) vs standalone line */
  inline?: boolean;
}

const ROW_STYLE = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 };
const STANDALONE_STYLE = { ...ROW_STYLE, paddingVertical: 6 };

const TranslateButtonComponent: React.FC<TranslateButtonProps> = ({
  isTranslated,
  isLoading,
  onTranslate,
  onShowOriginal,
  inline = false,
}) => {
  const style = inline ? ROW_STYLE : STANDALONE_STYLE;

  if (isLoading) {
    return (
      <View style={style}>
        <Icon name="Loader" size={12} color={colors.neutrals[600]} />
        <Text style={{ fontSize: 12, color: colors.neutrals[500] }}>Translating…</Text>
      </View>
    );
  }

  if (isTranslated) {
    return (
      <TouchableOpacity
        onPress={onShowOriginal}
        activeOpacity={0.7}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={style}
      >
        <Icon name="RotateCcw" size={12} color={colors.neutrals[600]} />
        <Text style={{ fontSize: 12, color: colors.neutrals[500] }}>Show original</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onTranslate}
      activeOpacity={0.7}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={inline ? ROW_STYLE : { paddingVertical: 6 }}
      accessibilityRole="button"
      accessibilityLabel="Translate"
    >
      <Icon name="Languages" size={16} color={colors.neutrals[600]} />
    </TouchableOpacity>
  );
};

export const TranslateButton = memo(TranslateButtonComponent);
export default TranslateButton;
