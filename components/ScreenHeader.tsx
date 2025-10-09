import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  canGoBack?: boolean;
  rightContent?: React.ReactNode;
  onBackPress?: () => void;
}

const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  canGoBack = true,
  rightContent,
  onBackPress,
}) => {
  const navigation = useNavigation();
  const showBack = canGoBack && (navigation as any).canGoBack?.();

  const handleBack = () => {
    if (onBackPress) return onBackPress();
    if (showBack) (navigation as any).goBack();
  };

  return (
    <View
      className="flex-row items-center justify-between px-4 h-16 bg-theme-neutrals-900"
      style={{ paddingTop: 0, ...(Platform.OS === 'android' ? { elevation: 0 } : {}) }}
    >
      <View className="flex-row items-center flex-1">
        {showBack && (
          <TouchableOpacity
            onPress={handleBack}
            className="w-10 h-10 mr-2 items-center justify-center active:opacity-70"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={22} color="#E5E7EB" />
          </TouchableOpacity>
        )}
        <View className="flex-shrink">
          <Text
            numberOfLines={1}
            className="text-theme-neutrals-100 text-2xl font-medium tracking-wide"
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={1}
              className="text-theme-neutrals-400 text-[11px] mt-0.5 tracking-wide"
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {rightContent ? (
        <View className="ml-3 flex-row items-center">{rightContent}</View>
      ) : null}
    </View>
  );
};

export default ScreenHeader;
