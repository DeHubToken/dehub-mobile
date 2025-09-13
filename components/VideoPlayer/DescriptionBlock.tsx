import React, { useCallback, useState } from 'react';
import { TouchableOpacity, Text, NativeSyntheticEvent, TextLayoutEventData, View } from 'react-native';

export interface DescriptionBlockProps {
  description?: string;
  showDesc: boolean;
  onToggle: () => void;
}

const DescriptionBlock: React.FC<DescriptionBlockProps> = ({ description, showDesc, onToggle }) => {
  const [canExpand, setCanExpand] = useState<boolean>(false);

  const handleTextLayout = useCallback((e: NativeSyntheticEvent<TextLayoutEventData>) => {
    // If text requires more than 3 lines, allow expand/collapse controls
    const totalLines = e.nativeEvent.lines?.length || 0;
    setCanExpand(totalLines > 3);
  }, []);

  const showToggle = canExpand;

  return (
    <View className="mt-4">
      <Text className="text-theme-neutrals-400 text-[10px] uppercase tracking-wide mb-2">
        Description
      </Text>
      <Text
        className="text-theme-neutrals-100 text-xs"
        numberOfLines={showDesc ? undefined : 3}
        onTextLayout={handleTextLayout}
      >
        {description || 'No description provided.'}
      </Text>
      {showToggle && (
        <TouchableOpacity onPress={onToggle} activeOpacity={0.7} className="mt-2 self-start">
          <Text className="text-theme-neutrals-500 text-[10px]">
            {showDesc ? 'Show less' : 'Show more'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default DescriptionBlock;
