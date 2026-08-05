import React, { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';

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
  return (
    <View className="flex-1 items-center justify-center px-6 py-16">
      <Ionicons name="videocam-off-outline" size={48} color={theme.colors.muted} />
      <Text className="text-center mt-4 text-base font-medium" style={{ color: theme.colors.foreground }}>
        {message}
      </Text>
      {onClear && (
        <Pressable
          accessibilityRole="button"
          onPress={onClear}
          className="mt-6 px-5 py-2 rounded-md bg-theme-neutrals-700 active:opacity-80"
        >
          <Text className="text-sm font-medium" style={{ color: theme.colors.neutrals[100] }}>{clearLabel}</Text>
        </Pressable>
      )}
    </View>
  );
};

export default memo(EmptyFeedState);