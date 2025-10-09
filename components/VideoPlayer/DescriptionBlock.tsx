import React, { useCallback, useState } from 'react';
import { TouchableOpacity, Text, NativeSyntheticEvent, TextLayoutEventData, View } from 'react-native';

export interface DescriptionBlockProps {
  title?: string;
  description?: string;
  showDesc: boolean;
  onToggle: () => void;
}

const DescriptionBlock: React.FC<DescriptionBlockProps> = ({ title = 'Description', description, showDesc, onToggle }) => {
  const [totalLines, setTotalLines] = useState<number | null>(null);
  const canExpand = (totalLines ?? 0) > 3;

  // Measure the full line count once using a hidden copy without numberOfLines
  const handleMeasureFullText = useCallback((e: NativeSyntheticEvent<TextLayoutEventData>) => {
    if (totalLines == null) {
      setTotalLines(e.nativeEvent.lines?.length || 0);
    }
  }, [totalLines]);

  const showToggle = canExpand;

  return (
    <View className="mt-4">
      <View className="bg-theme-neutrals-800 rounded-2xl p-4 overflow-hidden">
        <Text className="text-theme-neutrals-400 text-[10px] uppercase tracking-wide mb-2">
          {title}
        </Text>
        <Text
          className="text-theme-neutrals-100 text-xs"
          numberOfLines={showDesc ? undefined : 3}
          ellipsizeMode="tail"
        >
          {description || 'No description provided.'}
        </Text>
        {totalLines == null && (
          <Text
            className="text-theme-neutrals-100 text-xs absolute opacity-0 -z-10"
            // No numberOfLines: measure the full content once
            onTextLayout={handleMeasureFullText}
          >
            {description || 'No description provided.'}
          </Text>
        )}
        {showToggle && (
          <TouchableOpacity onPress={onToggle} activeOpacity={0.7} className="mt-2 self-start">
            <Text className="text-theme-neutrals-500 text-[10px]">
              {showDesc ? 'Show less' : 'Show more'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default DescriptionBlock;
