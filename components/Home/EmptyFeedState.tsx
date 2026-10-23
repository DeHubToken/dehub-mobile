import React, { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import { MINIMAL_TAB_LINE } from '../../theme/minimal';
import { ThemeIcon } from '../page/PageKit';

export interface EmptyFeedStateProps {
  message?: string;
  onClear?: () => void;
  clearLabel?: string;
}

const EmptyFeedState: React.FC<EmptyFeedStateProps> = ({
  message = 'No videos found',
  onClear,
  clearLabel = 'Clear Filters',
}) => {
  const { isMinimal, skin } = useAppTheme();
  return (
    <View className="flex-1 items-center justify-center px-6 py-16">
      {skin?.material === 'glass' ? <ThemeIcon icon="videos" size={56} /> : <Ionicons name="videocam-off-outline" size={48} color={theme.colors.mutedForeground} />}
      <Text className="text-center mt-4 text-base font-medium" style={{ color: theme.colors.foreground }}>
        {message}
      </Text>
      {onClear && (
        <Pressable
          accessibilityRole="button"
          onPress={onClear}
          // Minimal: a 1px outline, no fill.
          className={isMinimal ? "mt-6 px-5 py-2 border active:opacity-80" : "mt-6 px-5 py-2 rounded-md bg-theme-neutrals-700 active:opacity-80"}
          style={isMinimal ? { borderColor: MINIMAL_TAB_LINE } : skin?.material === 'glass' ? skin.centre : undefined}
        >
          <Text className="text-sm font-medium" style={{ color: theme.colors.neutrals[100] }}>{clearLabel}</Text>
        </Pressable>
      )}
    </View>
  );
};

export default memo(EmptyFeedState);
