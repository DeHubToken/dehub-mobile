import { useTranslation as _useCopy } from 'react-i18next';
import React, { useCallback, useState } from 'react';
import { TouchableOpacity, Text, NativeSyntheticEvent, TextLayoutEventData, View } from 'react-native';

export interface DescriptionBlockProps {
  title?: string;
  description?: string;
  showDesc: boolean;
  onToggle: () => void;
}

const DescriptionBlock: React.FC<DescriptionBlockProps> = ({ title = 'Description', description, showDesc, onToggle }) => {
  const { t: _copy } = _useCopy();
  const [totalLines, setTotalLines] = useState<number | null>(null);
  const canExpand = (totalLines ?? 0) > 3;

  const handleMeasureFullText = useCallback((e: NativeSyntheticEvent<TextLayoutEventData>) => {
    if (totalLines == null) {
      setTotalLines(e.nativeEvent.lines?.length || 0);
    }
  }, [totalLines]);

  const showToggle = canExpand;

  return (
    <View className="mt-4">
      <View className="bg-theme-neutrals-800 rounded-xl p-4 overflow-hidden">
        <Text className="text-theme-neutrals-400 text-xs uppercase tracking-wide mb-2">
          {title}
        </Text>
        <Text
          className="text-theme-neutrals-100 text-xs"
          numberOfLines={showDesc ? undefined : 3}
          ellipsizeMode="tail"
        >
          {description || _copy("copy.2527a18acbad", { defaultValue: "No description provided." })}
        </Text>
        {totalLines == null && (
          <Text
            className="text-theme-neutrals-100 text-xs absolute opacity-0 -z-10"
            // No numberOfLines: measure the full content once
            onTextLayout={handleMeasureFullText}
          >
            {description || _copy("copy.2527a18acbad", { defaultValue: "No description provided." })}
          </Text>
        )}
        {showToggle && (
          <TouchableOpacity
            onPress={onToggle}
            activeOpacity={0.7}
            className="mt-2 self-start"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text className="text-theme-neutrals-500 text-xs">
              {showDesc ? _copy("copy.94ea9b1d33a0", { defaultValue: "Show less" }) : _copy("copy.f5c9bd131486", { defaultValue: "Show more" })}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default DescriptionBlock;
