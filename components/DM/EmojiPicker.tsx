import React, { memo } from 'react';
import { View } from 'react-native';
import EmojiSelector, { Categories } from 'react-native-emoji-selector';

export type EmojiPickerProps = {
  onSelect: (emoji: string) => void;
  // Optional props for future customization
  showSearchBar?: boolean;
  showTabs?: boolean;
  showHistory?: boolean;
  category?: keyof typeof Categories | Categories;
  columns?: number;
};

const EmojiPicker: React.FC<EmojiPickerProps> = ({
  onSelect,
  showSearchBar = true,
  showTabs = true,
  showHistory = true,
  category = Categories.all,
  columns = 8,
}) => {
  return (
    <View className="flex-1">
      <EmojiSelector
        onEmojiSelected={onSelect}
        showSearchBar={showSearchBar}
        showTabs={showTabs}
        showHistory={showHistory}
        category={category as any}
        columns={columns}
        shouldInclude={undefined}
      />
    </View>
  );
};

export default memo(EmojiPicker);
