import React, { memo } from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import { useTranslation as useI18n } from 'react-i18next';
import Icon from './Icon';
import { SUPPORTED_LANGUAGES } from '../../i18n';
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

/** Backend hands back an ISO code; the reader needs the name of the language. */
const LANGUAGE_NAMES: Record<string, string> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((l) => [l.code, l.name]),
);

const ROW_STYLE = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 };
const STANDALONE_STYLE = { ...ROW_STYLE, paddingVertical: 6 };

const TranslateButtonComponent: React.FC<TranslateButtonProps> = ({
  isTranslated,
  isLoading,
  detectedLanguage,
  onTranslate,
  onShowOriginal,
  inline = false,
}) => {
  const { t } = useI18n();
  const style = inline ? ROW_STYLE : STANDALONE_STYLE;

  // "und" is the backend's way of saying it could not tell.
  const sourceLangName =
    detectedLanguage && !['und', 'auto', 'unknown'].includes(detectedLanguage)
      ? LANGUAGE_NAMES[detectedLanguage]
      : undefined;

  if (isLoading) {
    return (
      <View style={style}>
        <Icon name="Loader" size={12} color={colors.neutrals[600]} />
        <Text style={{ fontSize: 12, color: colors.neutrals[500] }}>{t('common.translating')}</Text>
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
        <Text style={{ fontSize: 12, color: colors.neutrals[500] }}>{t('common.showOriginal')}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onTranslate}
      activeOpacity={0.7}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={style}
      accessibilityRole="button"
      accessibilityLabel="Translate"
    >
      <Icon name="Languages" size={16} color={colors.neutrals[600]} />
      {/* Back on the original after "show original": name the language it is
          in, so the control reads as an offer rather than a mystery. */}
      {sourceLangName ? (
        <Text style={{ fontSize: 12, color: colors.neutrals[500] }}>{sourceLangName}</Text>
      ) : null}
    </TouchableOpacity>
  );
};

export const TranslateButton = memo(TranslateButtonComponent);
export default TranslateButton;
